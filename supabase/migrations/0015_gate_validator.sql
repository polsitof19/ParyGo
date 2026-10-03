-- =============================================================
-- 0015 · Gate validator — scan model + validate_ticket RPC
-- =============================================================
-- Door validation for tickets. Adds a scan model and an atomic, race-safe
-- validate_ticket RPC. Convention for max_scans:
--   1     = single entry (default)
--   N>=2  = N re-entries allowed
--   NULL  = unlimited (staff / courtesy / press)
-- A CHECK forbids the degenerate 0/negative state.
--
-- Concurrency: validate_ticket does SELECT ... FOR UPDATE on the ticket row,
-- so two simultaneous scans of the same QR with max_scans=1 → exactly 1 OK,
-- 1 ALREADY_USED. Offline scans replay through the same RPC with the real
-- scanned_at + a client_scan_id for idempotent sync; double-scans across
-- devices surface as ALREADY_USED and are auditable in ticket_scans.
--
-- LOCKDOWN (lesson from 0014): revoke EXECUTE from anon + authenticated
-- explicitly; only service_role (server action) may call it.
-- Idempotent.
-- =============================================================

-- ------- 1. Scan columns -------
alter table public.ticket_types
  add column if not exists max_scans int default 1
    check (max_scans is null or max_scans >= 1);

alter table public.tickets
  add column if not exists max_scans int
    check (max_scans is null or max_scans >= 1);
alter table public.tickets
  add column if not exists scan_count int not null default 0
    check (scan_count >= 0);

-- Backfill already-issued tickets: inherit max_scans from their type; a ticket
-- already validated counts as 1 consumed scan. Guarded so re-runs are no-ops.
update public.tickets t
set max_scans = tt.max_scans,
    scan_count = case when t.validated_at is not null then 1 else 0 end
from public.ticket_types tt
where tt.id = t.ticket_type_id
  and t.max_scans is null
  and t.scan_count = 0;

-- ------- 2. ticket_scans (append-only audit of every scan attempt) -------
create table if not exists public.ticket_scans (
  id                uuid primary key default uuid_generate_v4(),
  ticket_id         uuid not null references public.tickets(id) on delete cascade,
  event_id          uuid not null references public.events(id) on delete cascade,
  brand_id          uuid not null references public.brands(id) on delete cascade,
  validator_user_id uuid references auth.users(id) on delete set null,
  device_id         text,
  was_offline       boolean not null default false,
  scanned_at        timestamptz not null default now(),
  synced_at         timestamptz not null default now(),
  result            text not null,
  scan_index        int,
  client_scan_id    uuid,
  created_at        timestamptz not null default now()
);
create index if not exists ticket_scans_ticket_idx on public.ticket_scans (ticket_id, scanned_at);
create index if not exists ticket_scans_event_idx  on public.ticket_scans (event_id, scanned_at desc);
create unique index if not exists ticket_scans_client_scan_uq
  on public.ticket_scans (client_scan_id) where client_scan_id is not null;

alter table public.ticket_scans enable row level security;
drop policy if exists ticket_scans_read on public.ticket_scans;
create policy ticket_scans_read on public.ticket_scans for select
  to authenticated
  using (is_super_admin() or user_is_brand_member(brand_id, 'brand_admin'));

-- ------- 3. validate_ticket RPC -------
create or replace function public.validate_ticket(
  p_qr_code           uuid,
  p_validator_user_id uuid,
  p_offline           boolean     default false,
  p_scanned_at        timestamptz default null,
  p_device_id         text        default null,
  p_client_scan_id    uuid        default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket     public.tickets%rowtype;
  v_brand_id   uuid;
  v_authorized boolean;
  v_scanned_at timestamptz := coalesce(p_scanned_at, now());
  v_is_first   boolean := false;
  v_result     text;
  v_can_scan   boolean;
  v_prev       text;
begin
  -- Idempotent offline sync: a client_scan_id already processed returns its
  -- prior result without re-processing.
  if p_client_scan_id is not null then
    select result into v_prev from public.ticket_scans
    where client_scan_id = p_client_scan_id limit 1;
    if found then
      return jsonb_build_object('ok', v_prev in ('OK', 'REENTRY'),
                                'status', v_prev, 'duplicate_sync', true);
    end if;
  end if;

  -- Lock the ticket row (serializes concurrent scans of THIS ticket).
  select * into v_ticket from public.tickets where qr_code = p_qr_code for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'NOT_FOUND');
  end if;
  v_brand_id := v_ticket.brand_id;

  -- Authorization: the scanner must be validator/brand_admin of the ticket's
  -- brand (or super admin). The validator id comes from the session, not a form.
  select
    exists (select 1 from public.brand_members
            where user_id = p_validator_user_id and brand_id = v_brand_id
              and role in ('validator', 'brand_admin'))
    or exists (select 1 from public.user_profiles
               where user_id = p_validator_user_id and is_super_admin = true)
  into v_authorized;

  if not v_authorized then
    insert into public.ticket_scans (ticket_id, event_id, brand_id, validator_user_id, device_id, was_offline, scanned_at, result, client_scan_id)
    values (v_ticket.id, v_ticket.event_id, v_brand_id, p_validator_user_id, p_device_id, coalesce(p_offline, false), v_scanned_at, 'NOT_AUTHORIZED', p_client_scan_id);
    return jsonb_build_object('ok', false, 'status', 'NOT_AUTHORIZED');
  end if;

  if v_ticket.invalidated_at is not null then
    insert into public.ticket_scans (ticket_id, event_id, brand_id, validator_user_id, device_id, was_offline, scanned_at, result, client_scan_id)
    values (v_ticket.id, v_ticket.event_id, v_brand_id, p_validator_user_id, p_device_id, coalesce(p_offline, false), v_scanned_at, 'INVALIDATED', p_client_scan_id);
    return jsonb_build_object('ok', false, 'status', 'INVALIDATED',
        'attendee_name', v_ticket.attendee_name, 'ticket_type_name', v_ticket.ticket_type_name);
  end if;

  v_can_scan := (v_ticket.max_scans is null) or (v_ticket.scan_count < v_ticket.max_scans);

  if not v_can_scan then
    insert into public.ticket_scans (ticket_id, event_id, brand_id, validator_user_id, device_id, was_offline, scanned_at, result, scan_index, client_scan_id)
    values (v_ticket.id, v_ticket.event_id, v_brand_id, p_validator_user_id, p_device_id, coalesce(p_offline, false), v_scanned_at, 'ALREADY_USED', v_ticket.scan_count, p_client_scan_id);
    return jsonb_build_object('ok', false, 'status', 'ALREADY_USED',
        'attendee_name', v_ticket.attendee_name, 'ticket_type_name', v_ticket.ticket_type_name,
        'scan_count', v_ticket.scan_count, 'max_scans', v_ticket.max_scans,
        'first_validated_at', v_ticket.validated_at);
  end if;

  v_is_first := (v_ticket.scan_count = 0);

  update public.tickets
  set scan_count = scan_count + 1,
      validated_at = case when validated_at is null then v_scanned_at else validated_at end,
      validated_by = case when validated_at is null then p_validator_user_id else validated_by end,
      validated_offline = case when validated_at is null then coalesce(p_offline, false) else validated_offline end
  where id = v_ticket.id
  returning scan_count, validated_at into v_ticket.scan_count, v_ticket.validated_at;

  v_result := case when v_is_first then 'OK' else 'REENTRY' end;

  insert into public.ticket_scans (ticket_id, event_id, brand_id, validator_user_id, device_id, was_offline, scanned_at, result, scan_index, client_scan_id)
  values (v_ticket.id, v_ticket.event_id, v_brand_id, p_validator_user_id, p_device_id, coalesce(p_offline, false), v_scanned_at, v_result, v_ticket.scan_count, p_client_scan_id);

  if v_is_first then
    insert into public.events_log (brand_id, event_id, ticket_id, actor_user_id, type, payload)
    values (v_brand_id, v_ticket.event_id, v_ticket.id, p_validator_user_id, 'ticket_validated',
        jsonb_build_object('offline', coalesce(p_offline, false), 'scanned_at', v_scanned_at, 'device_id', p_device_id));
  end if;

  return jsonb_build_object('ok', true, 'status', v_result,
      'attendee_name', v_ticket.attendee_name, 'ticket_type_name', v_ticket.ticket_type_name,
      'scan_count', v_ticket.scan_count, 'max_scans', v_ticket.max_scans,
      'first_validated_at', v_ticket.validated_at);
end;
$$;

-- ------- 4. Lockdown grants (explicit anon + authenticated revoke) -------
revoke execute on function public.validate_ticket(uuid, uuid, boolean, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.validate_ticket(uuid, uuid, boolean, timestamptz, text, uuid) to service_role;
