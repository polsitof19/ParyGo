-- =============================================================
-- 0048 — Cancelar evento + aviso masivo por email
-- =============================================================
-- El organizador cancela un evento: queda marcado cancelado (cancelled_at), se
-- despublica (deja de venderse y desaparece del público) y se avisa por email a
-- cada comprador con entrada válida. NO toca tickets ni dinero (los reembolsos
-- los maneja el organizador con sus credenciales, fuera de la plataforma).
--
-- Reusa la cola notification_jobs: nuevo kind 'event_cancelled'. El enqueue lo
-- llama la action UNA vez (no el cron); el worker /api/cron/notifications procesa
-- los jobs pendientes como con los demás kinds. dedupe_key = cancel:event:email
-- → un único aviso por comprador.
--
-- service_role-only (lockdown 0014).
-- =============================================================

-- 1) Estado de cancelación en el evento.
alter table public.events add column if not exists cancelled_at timestamptz;
alter table public.events add column if not exists cancellation_reason text;

-- 2) Permitir el nuevo kind en la cola.
alter table public.notification_jobs drop constraint if exists notification_jobs_kind_check;
alter table public.notification_jobs add constraint notification_jobs_kind_check
  check (kind in ('yape_recovery','yape_pending_digest','event_reminder','event_cancelled'));

-- 3) Encolar el aviso de cancelación: un email por comprador con entrada válida.
create or replace function public.enqueue_event_cancellation(
  p_event_id uuid,
  p_brand_id uuid,
  p_event_name text,
  p_starts_iso text,
  p_reason text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.notification_jobs
    (kind, brand_id, event_id, order_id, recipient_email, recipient_name, payload, dedupe_key)
  select
    'event_cancelled', p_brand_id, p_event_id, null,
    lower(o.buyer_email), coalesce(max(o.buyer_name), ''),
    jsonb_build_object(
      'event_name', p_event_name,
      'starts_at', p_starts_iso,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    ),
    'cancel:' || p_event_id::text || ':' || lower(o.buyer_email)
  from public.orders o
  where o.event_id = p_event_id
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

revoke execute on function public.enqueue_event_cancellation(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.enqueue_event_cancellation(uuid, uuid, text, text, text) to service_role;

notify pgrst, 'reload schema';
