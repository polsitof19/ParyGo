-- =============================================================
-- 0039 — Cola GENÉRICA de notificaciones (Grupo C, TANDA 1). Reusa el patrón
-- de la cola de postergación (0033) sin tocarla. Dos kinds:
--   yape_recovery        → recordar al COMPRADOR un Yape a medias (sin prueba).
--   yape_pending_digest  → avisar al ORGANIZADOR de N pruebas Yape por aprobar.
-- =============================================================
-- NO emite entradas, NO mueve dinero, NO aprueba Yape, NO toca emisión/
-- validate_ticket/settle/apply_promo/precio/aforo(0031)/contador(0032). Solo
-- AVISA/RECUERDA por email. El encolado deriva destinatarios server-side (la
-- lista nunca sale del DB). Idempotente por dedupe_key. Entrega at-least-once
-- (Idempotency-Key a Resend dedup 24h → un crash post-envío no duplica).
--
-- CONFIGURABLE OFF: por marca, dos flags OPT-IN (default FALSE) para no afectar
-- marcas en vivo (ej. Code/Almighty) hasta que se habiliten a mano. Además el
-- worker no corre hasta que se agende el pg_cron (fuera de banda, lleva secreto).
--
-- PII: notification_jobs guarda email+nombre del destinatario + un payload con
-- labels del evento (nada de tarjetas/DNI). RLS ON + 0 policies = solo
-- service_role (igual que event_postpone_emails y stock_reservations).
-- Lockdown 0014 en las 3 RPCs (revoke anon+authenticated, grant service_role).
-- =============================================================

-- Flags opt-in por marca (configurable off; default FALSE = no molesta a nadie).
alter table public.brands add column if not exists notify_yape_recovery boolean not null default false;
alter table public.brands add column if not exists notify_yape_digest    boolean not null default false;

create table if not exists public.notification_jobs (
  id              uuid primary key default uuid_generate_v4(),
  kind            text not null check (kind in ('yape_recovery','yape_pending_digest')),
  brand_id        uuid references public.brands(id) on delete cascade,
  event_id        uuid references public.events(id) on delete cascade,
  order_id        uuid references public.orders(id) on delete cascade,  -- null en digest
  recipient_email text not null,
  recipient_name  text not null default '',
  -- snapshot mínimo para componer el email (labels del evento, conteo, etc).
  payload         jsonb not null default '{}'::jsonb,
  -- idempotencia: yape_recovery:<order_id> (1 por orden) /
  --               yape_pending_digest:<event_id>:<bucket> (1 por evento por ventana).
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
create index if not exists notification_jobs_claimable_idx
  on public.notification_jobs (created_at)
  where status in ('pending','failed','processing');

alter table public.notification_jobs enable row level security;
-- Sin policies a propósito: RLS ON + 0 policies = deny por defecto. Solo
-- service_role (que bypassa RLS) accede, vía las RPCs y el worker server-side.

-- -------------------------------------------------------------
-- enqueue_yape_notifications — escanea y encola AMBOS kinds, idempotente.
--   p_recovery_min_age_hours: edad mínima de la orden para recordar (no apurar).
--   p_recovery_max_age_hours: edad máxima (no recordar órdenes viejas/muertas).
--   p_digest_bucket_seconds:  ventana del digest (1 email por evento por ventana).
-- Devuelve cuántos trabajos NUEVOS encoló (recovery + digest).
-- -------------------------------------------------------------
create or replace function public.enqueue_yape_notifications(
  p_recovery_min_age_hours int default 2,
  p_recovery_max_age_hours int default 72,
  p_digest_bucket_seconds  int default 21600  -- 6 horas
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  v_n int;
begin
  -- C3 — yape_recovery: órdenes Yape SIN prueba, en la ventana de edad, de marcas
  -- que habilitaron el recordatorio. 1 por orden (dedupe_key = yape_recovery:<id>).
  insert into public.notification_jobs
    (kind, brand_id, event_id, order_id, recipient_email, recipient_name, payload, dedupe_key)
  select
    'yape_recovery', o.brand_id, o.event_id, o.id,
    lower(o.buyer_email), coalesce(o.buyer_name, ''),
    jsonb_build_object(
      'event_name', e.name, 'event_slug', e.slug, 'brand_slug', b.slug,
      'total_cents', o.total_cents
    ),
    'yape_recovery:' || o.id::text
  from public.orders o
  join public.events e on e.id = o.event_id
  join public.brands b on b.id = o.brand_id
  where o.payment_method = 'yape_manual'
    and o.status = 'pending_yape_review'
    and b.notify_yape_recovery = true
    and o.created_at < now() - make_interval(hours => greatest(0, p_recovery_min_age_hours))
    and o.created_at > now() - make_interval(hours => greatest(1, p_recovery_max_age_hours))
    and o.buyer_email is not null and btrim(o.buyer_email) <> ''
    and not exists (select 1 from public.yape_proofs yp where yp.order_id = o.id)
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- C4 — yape_pending_digest: por evento con ≥1 prueba en pending_review, de marcas
  -- que habilitaron el digest y con contact_email. 1 email por evento por ventana
  -- (dedupe_key = yape_pending_digest:<event_id>:<bucket>).
  insert into public.notification_jobs
    (kind, brand_id, event_id, order_id, recipient_email, recipient_name, payload, dedupe_key)
  select
    'yape_pending_digest', e.brand_id, e.id, null,
    lower(b.contact_email), coalesce(b.name, ''),
    jsonb_build_object(
      'event_name', e.name, 'event_slug', e.slug, 'brand_slug', b.slug,
      'pending_count', cnt.n
    ),
    'yape_pending_digest:' || e.id::text || ':' ||
      (floor(extract(epoch from now()) / greatest(60, p_digest_bucket_seconds)))::bigint::text
  from public.events e
  join public.brands b on b.id = e.brand_id
  join (
    select o.event_id, count(*)::int as n
    from public.yape_proofs yp
    join public.orders o on o.id = yp.order_id
    where yp.status = 'pending_review'
    group by o.event_id
  ) cnt on cnt.event_id = e.id
  where b.notify_yape_digest = true
    and b.contact_email is not null and btrim(b.contact_email) <> ''
    and cnt.n > 0
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return v_total;
end;
$$;

-- -------------------------------------------------------------
-- claim_notification_jobs — el worker reclama una tanda ATÓMICAMENTE
-- (FOR UPDATE SKIP LOCKED). Toma pendientes, fallidos (reintento) y 'processing'
-- colgados >5 min (recovery). Tope 5 intentos (dead-letter). Marca 'processing'.
-- -------------------------------------------------------------
create or replace function public.claim_notification_jobs(p_limit int default 50)
returns setof public.notification_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id from public.notification_jobs
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
  update public.notification_jobs q
     set status = 'processing', attempts = q.attempts + 1, claimed_at = now()
  from picked
  where q.id = picked.id
  returning q.*;
end;
$$;

-- Lockdown 0014: revoke explícito anon Y authenticated; solo service_role.
revoke execute on function public.enqueue_yape_notifications(int, int, int) from public, anon, authenticated;
revoke execute on function public.claim_notification_jobs(int) from public, anon, authenticated;
grant execute on function public.enqueue_yape_notifications(int, int, int) to service_role;
grant execute on function public.claim_notification_jobs(int) to service_role;

notify pgrst, 'reload schema';
