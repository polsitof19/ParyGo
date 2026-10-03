-- =============================================================
-- 0046 — Recordatorio pre-evento por email (reusa notification_jobs)
-- =============================================================
-- Email transaccional al comprador ~24h antes del evento: "Tu evento es mañana".
-- NO es marketing (compraste una entrada → recordarte el evento es servicio), así
-- que va a TODOS los compradores con entrada válida, sin depender de marketing_opt_in.
--
-- Reusa la cola existente: nuevo kind 'event_reminder' + un enqueue idempotente que
-- el worker /api/cron/notifications ya corre (pg_cron parygo-notifications, /5 min).
-- dedupe_key = 'reminder:'||event_id||':'||email → un único recordatorio por
-- comprador por evento (ON CONFLICT DO NOTHING). Compradores tardíos (dentro de
-- las 24h) se encolan en la siguiente corrida, también una sola vez.
--
-- OPT-IN por evento (events.send_reminder, default false): el organizador lo
-- activa explícitamente. Default OFF → ningún evento (incl. Almighty) manda
-- recordatorios sin que el dueño lo pida. Cero envíos sorpresa.
--
-- service_role-only (lockdown 0014): lo llama el worker con el admin client.
-- =============================================================

-- 1) Permitir el nuevo kind en la cola.
alter table public.notification_jobs drop constraint if exists notification_jobs_kind_check;
alter table public.notification_jobs add constraint notification_jobs_kind_check
  check (kind in ('yape_recovery','yape_pending_digest','event_reminder'));

-- 2) Toggle opt-in por evento (default OFF).
alter table public.events add column if not exists send_reminder boolean not null default false;

-- 3) Encolar recordatorios de eventos OPT-IN que arrancan dentro de las próximas 24h.
create or replace function public.enqueue_event_reminders()
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
    'event_reminder', e.brand_id, e.id, null,
    lower(o.buyer_email), coalesce(max(o.buyer_name), ''),
    jsonb_build_object(
      'event_name', e.name,
      'event_slug', e.slug,
      'starts_at', e.starts_at,
      'venue', e.venue_name
    ),
    'reminder:' || e.id::text || ':' || lower(o.buyer_email)
  from public.events e
  join public.orders o on o.event_id = e.id
  where e.is_published = true
    and e.archived_at is null
    and e.send_reminder = true
    and e.starts_at > now()
    and e.starts_at <= now() + interval '24 hours'
    and o.buyer_email is not null and btrim(o.buyer_email) <> ''
    and o.id in (
      select distinct t.order_id from public.tickets t
      where t.event_id = e.id and t.invalidated_at is null
    )
  group by e.brand_id, e.id, e.name, e.slug, e.starts_at, e.venue_name, lower(o.buyer_email)
  on conflict (dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.enqueue_event_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_event_reminders() to service_role;

notify pgrst, 'reload schema';
