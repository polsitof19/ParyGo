-- =============================================================
-- ParyGo · stock reservations (anti-oversell)
-- =============================================================
-- Holds tickets while the buyer is in checkout. Two scenarios:
--   1) Buyer picks quantity → reservation created/extended for 15 min.
--   2) Buyer pays → reservation cleared when tickets are issued.
--   3) Buyer abandons → pg_cron sweep clears expired reservations.
--
-- Available stock = capacity - sold(invalidated_at is null) - reserved(not expired).
-- All access goes through RPCs called by server-side service_role; no anon
-- RLS policies — RLS enabled with no policies = deny by default.
-- =============================================================

create table if not exists public.stock_reservations (
  id              uuid primary key default uuid_generate_v4(),
  ticket_type_id  uuid not null references public.ticket_types(id) on delete cascade,
  quantity        integer not null check (quantity > 0),
  session_id      text not null,
  order_id        uuid references public.orders(id) on delete cascade,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  -- One row per (session, ticket_type). Refreshing replaces in place.
  unique (session_id, ticket_type_id)
);
create index if not exists stock_reservations_expires_idx
  on public.stock_reservations (expires_at);
create index if not exists stock_reservations_ticket_type_active_idx
  on public.stock_reservations (ticket_type_id) where order_id is null;
create index if not exists stock_reservations_order_idx
  on public.stock_reservations (order_id) where order_id is not null;

alter table public.stock_reservations enable row level security;
-- No policies on purpose. service_role bypasses; all access is via RPCs below.

-- -------------------------------------------------------------
-- get_available_stock(ticket_type_id) → integer
-- Returns capacity - sold - reserved_active.
-- Counts only reservations not yet attached to a paid order and not expired.
-- -------------------------------------------------------------
create or replace function public.get_available_stock(p_ticket_type_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_sold     int;
  v_reserved int;
begin
  select capacity, sold into v_capacity, v_sold
  from public.ticket_types
  where id = p_ticket_type_id;

  if v_capacity is null then
    return 0;
  end if;

  select coalesce(sum(quantity), 0)::int into v_reserved
  from public.stock_reservations
  where ticket_type_id = p_ticket_type_id
    and expires_at > now()
    and order_id is null;

  return greatest(0, v_capacity - v_sold - v_reserved);
end;
$$;

-- -------------------------------------------------------------
-- create_or_refresh_stock_reservation
-- Upsert a per-session, per-ticket-type reservation with a fresh 15-min TTL.
-- If quantity = 0 → delete any existing reservation for that combo.
-- Returns the new expires_at so the client can render a countdown.
-- Raises an exception if the request exceeds available stock.
-- -------------------------------------------------------------
create or replace function public.create_or_refresh_stock_reservation(
  p_session_id text,
  p_ticket_type_id uuid,
  p_quantity integer
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available int;
  v_existing  int;
  v_expires   timestamptz;
begin
  if p_session_id is null or length(p_session_id) < 8 then
    raise exception 'invalid session_id';
  end if;

  if p_quantity < 0 then
    raise exception 'quantity must be >= 0';
  end if;

  -- Drop reservation entirely on quantity 0.
  if p_quantity = 0 then
    delete from public.stock_reservations
    where session_id = p_session_id
      and ticket_type_id = p_ticket_type_id
      and order_id is null;
    return null;
  end if;

  -- How much does THIS session already hold for this type?
  select coalesce(quantity, 0) into v_existing
  from public.stock_reservations
  where session_id = p_session_id
    and ticket_type_id = p_ticket_type_id
    and order_id is null;
  v_existing := coalesce(v_existing, 0);

  -- Available excluding our own existing hold.
  v_available := public.get_available_stock(p_ticket_type_id) + v_existing;
  if v_available < p_quantity then
    raise exception 'insufficient_stock: available=% requested=%', v_available, p_quantity;
  end if;

  v_expires := now() + interval '15 minutes';

  insert into public.stock_reservations
    (ticket_type_id, quantity, session_id, expires_at)
  values
    (p_ticket_type_id, p_quantity, p_session_id, v_expires)
  on conflict (session_id, ticket_type_id) do update
    set quantity = excluded.quantity,
        expires_at = excluded.expires_at,
        order_id = null;

  return v_expires;
end;
$$;

-- -------------------------------------------------------------
-- attach_reservation_to_order
-- Called from server action right after order row is created — marks the
-- reservation as belonging to that order so it can't be reused and so the
-- sweep won't delete it while payment is in flight.
-- -------------------------------------------------------------
create or replace function public.attach_reservation_to_order(
  p_session_id text,
  p_order_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.stock_reservations
  set order_id = p_order_id,
      expires_at = greatest(expires_at, now() + interval '30 minutes')
  where session_id = p_session_id
    and order_id is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -------------------------------------------------------------
-- release_stock_reservations_for_order
-- After tickets are issued (or order is failed/refunded), drop the rows.
-- Idempotent.
-- -------------------------------------------------------------
create or replace function public.release_stock_reservations_for_order(
  p_order_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.stock_reservations where order_id = p_order_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -------------------------------------------------------------
-- cleanup_expired_reservations — sweep used by pg_cron.
-- Returns how many rows were freed.
-- -------------------------------------------------------------
create or replace function public.cleanup_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.stock_reservations
  where expires_at < now()
    and order_id is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Restrict execution. RPCs are reachable from PostgREST under service_role
-- (server actions), not from anon/authenticated.
revoke execute on function public.get_available_stock(uuid) from public;
revoke execute on function public.create_or_refresh_stock_reservation(text, uuid, integer) from public;
revoke execute on function public.attach_reservation_to_order(text, uuid) from public;
revoke execute on function public.release_stock_reservations_for_order(uuid) from public;
revoke execute on function public.cleanup_expired_reservations() from public;
grant execute on function public.get_available_stock(uuid) to service_role;
grant execute on function public.create_or_refresh_stock_reservation(text, uuid, integer) to service_role;
grant execute on function public.attach_reservation_to_order(text, uuid) to service_role;
grant execute on function public.release_stock_reservations_for_order(uuid) to service_role;
grant execute on function public.cleanup_expired_reservations() to service_role;

-- -------------------------------------------------------------
-- pg_cron sweep every 5 minutes.
-- pg_cron must be enabled on the project (Database → Extensions).
-- If the extension isn't available, this block is a no-op.
-- -------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Unschedule prior version to make this migration idempotent.
    perform cron.unschedule('parygo-cleanup-reservations')
      where exists (select 1 from cron.job where jobname = 'parygo-cleanup-reservations');
    perform cron.schedule(
      'parygo-cleanup-reservations',
      '*/5 * * * *',
      $cron$ select public.cleanup_expired_reservations(); $cron$
    );
  end if;
end $$;
