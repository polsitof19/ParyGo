-- =============================================================
-- 0033 — Cola de emails de POSTERGACIÓN (Fase 4 de escala). Entrega a escala.
-- =============================================================
-- PROBLEMA: postponeEventAction enviaba los avisos en un loop secuencial `await`
-- DENTRO del Server Action de Edge. Con 10k compradores → minutos de fetches en
-- serie → timeout del Edge → algunos no reciben el aviso; y sin idempotencia por
-- destinatario, un reintento reenviaba a los que ya recibieron.
--
-- SOLUCIÓN: sacar el envío del request. La acción cambia la fecha (atómico, como
-- ya hace) y ENCOLA un trabajo por destinatario; responde rápido. Un worker
-- (ruta Edge disparada por pg_cron vía pg_net) procesa la cola en tandas con
-- reintentos acotados e idempotencia por destinatario.
--
-- IDEMPOTENCIA: dedupe_key = event_id:fecha_nueva:email (único). Re-postergar a la
-- MISMA fecha o re-encolar → ON CONFLICT DO NOTHING (no se encola dos veces el
-- aviso del mismo evento+fecha). Re-correr el worker → solo toma pendientes/
-- fallidos; los 'sent' nunca se reprocesan. Entrega "at-least-once": un duplicado
-- SOLO sería posible si el worker crashea entre el envío a Resend y el mark(sent)
-- y luego se re-reclama el 'processing' colgado — mitigado de raíz pasando el
-- dedupe_key como Idempotency-Key a Resend (deduplica 24h del lado de Resend).
--
-- PII: la cola guarda email+nombre del comprador (lo mínimo para enviar) +
-- ref del evento. RLS ON sin policies = solo service_role (igual que
-- stock_reservations). El enqueue DERIVA los destinatarios server-side desde
-- tickets/orders → la lista de compradores nunca sale del DB hacia la app.
--
-- NO toca: emisión, validate_ticket, settle, apply_promo, precio, saldo,
-- max_scans, RLS base, archivado, el aforo/oversell (0031), el contador (0032).
-- El cambio de fecha (postponeEventAction) sigue atómico y sin tocar tickets.
-- Lockdown 0014 en las 2 RPCs. Idempotente.
--
-- NOTA OPS (no en este archivo, lleva secreto): el pg_cron que dispara el worker
-- se agenda fuera de banda con CRON_SECRET + NEXT_PUBLIC_APP_URL:
--   select cron.schedule('parygo-postpone-emails','* * * * *', $$
--     select net.http_post(url:='<APP_URL>/api/cron/postpone-emails',
--       headers:=jsonb_build_object('Authorization','Bearer <CRON_SECRET>',
--                                    'Content-Type','application/json'),
--       body:='{}'::jsonb); $$);
-- =============================================================

create table if not exists public.event_postpone_emails (
  id              uuid primary key default uuid_generate_v4(),
  brand_id        uuid references public.brands(id) on delete cascade,
  event_id        uuid references public.events(id) on delete cascade,
  recipient_email text not null,
  recipient_name  text not null default '',
  -- snapshot del aviso (la fecha del evento YA cambió cuando se procesa, por eso
  -- los labels viejo/nuevo se congelan en el encolado).
  event_name      text not null,
  old_date_label  text not null,
  new_date_label  text not null,
  venue           text,
  -- idempotencia por destinatario para esta postergación específica.
  dedupe_key      text not null unique,
  status          text not null default 'pending'
                    check (status in ('pending','processing','sent','failed')),
  attempts        int  not null default 0,
  last_error      text,
  resend_id       text,
  created_at      timestamptz not null default now(),
  claimed_at      timestamptz,
  sent_at         timestamptz
);

-- Índice parcial para que el claim encuentre rápido lo procesable.
create index if not exists event_postpone_emails_claimable_idx
  on public.event_postpone_emails (created_at)
  where status in ('pending','failed','processing');

alter table public.event_postpone_emails enable row level security;
-- Sin policies a propósito: RLS ON + 0 policies = deny por defecto. Solo
-- service_role (que bypassa RLS) accede, vía las RPCs y el worker server-side.

-- -------------------------------------------------------------
-- enqueue_event_postpone_emails — encola UN trabajo por comprador con entradas
-- VÁLIDAS del evento. Deriva los destinatarios server-side (la lista nunca sale
-- del DB). Dedup por email + idempotente por dedupe_key. Devuelve cuántos encoló.
-- -------------------------------------------------------------
create or replace function public.enqueue_event_postpone_emails(
  p_event_id uuid,
  p_brand_id uuid,
  p_event_name text,
  p_old_label text,
  p_new_label text,
  p_venue text,
  p_new_iso text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.event_postpone_emails
    (brand_id, event_id, recipient_email, recipient_name,
     event_name, old_date_label, new_date_label, venue, dedupe_key)
  select
    p_brand_id, p_event_id,
    lower(o.buyer_email), coalesce(max(o.buyer_name), ''),
    p_event_name, p_old_label, p_new_label, nullif(p_venue, ''),
    p_event_id::text || ':' || p_new_iso || ':' || lower(o.buyer_email)
  from public.orders o
  where o.event_id = p_event_id                         -- tenancy: solo ese evento
    and o.buyer_email is not null and btrim(o.buyer_email) <> ''
    and o.id in (
      select distinct t.order_id from public.tickets t
      where t.event_id = p_event_id and t.invalidated_at is null
    )
  group by lower(o.buyer_email)
  on conflict (dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -------------------------------------------------------------
-- claim_postpone_emails — el worker reclama una tanda ATÓMICAMENTE
-- (FOR UPDATE SKIP LOCKED → dos corridas del cron no toman las mismas filas).
-- Toma pendientes, fallidos (reintento) y 'processing' colgados >5 min (recovery
-- de un worker que murió a mitad). Tope 5 intentos (dead-letter). Marca
-- 'processing' + incrementa attempts. El worker luego marca sent/failed.
-- -------------------------------------------------------------
create or replace function public.claim_postpone_emails(p_limit int default 50)
returns setof public.event_postpone_emails
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id from public.event_postpone_emails
    where attempts < 5
      and (
        status = 'pending'
        or status = 'failed'
        or (status = 'processing' and claimed_at < now() - interval '5 minutes')
      )
    order by created_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  )
  update public.event_postpone_emails q
     set status = 'processing', attempts = q.attempts + 1, claimed_at = now()
  from picked
  where q.id = picked.id
  returning q.*;
end;
$$;

-- Lockdown 0014: revoke explícito anon Y authenticated; solo service_role.
revoke execute on function public.enqueue_event_postpone_emails(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.claim_postpone_emails(int) from public, anon, authenticated;
grant execute on function public.enqueue_event_postpone_emails(uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.claim_postpone_emails(int) to service_role;

notify pgrst, 'reload schema';
