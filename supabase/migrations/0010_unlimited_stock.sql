-- =============================================================
-- 0010 · Unlimited stock flag (schema + reservation logic)
-- =============================================================
-- Replaces the capacity=100000 "bridge" hack with a real model: a
-- ticket_type can be flagged is_unlimited. Unlimited types never block on
-- stock (no oversell risk); limited types keep the full anti-oversell +
-- 15-min reservation flow intact.
--
-- This migration is SCHEMA + LOGIC ONLY (backwards-compatible): the column
-- defaults to false, so every existing ticket_type — including Code's —
-- behaves exactly as before. The DATA flip (Code General/VIP -> unlimited,
-- capacity 0) lives in 0011 and MUST run only AFTER the new app code is
-- deployed, otherwise the old deployed code would read capacity=0 and show
-- the live Almighty sale as sold out.
--
-- Idempotent.
-- =============================================================

alter table public.ticket_types
  add column if not exists is_unlimited boolean not null default false;

-- get_available_stock: unlimited types report an effectively-infinite figure
-- so no caller ever blocks on them.
create or replace function public.get_available_stock(p_ticket_type_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_capacity  int;
  v_sold      int;
  v_reserved  int;
  v_unlimited boolean;
begin
  select capacity, sold, is_unlimited
    into v_capacity, v_sold, v_unlimited
  from public.ticket_types
  where id = p_ticket_type_id;

  if v_capacity is null then
    return 0;  -- ticket type not found
  end if;

  if v_unlimited then
    return 1000000000;  -- effectively infinite
  end if;

  select coalesce(sum(quantity), 0)::int into v_reserved
  from public.stock_reservations
  where ticket_type_id = p_ticket_type_id
    and expires_at > now()
    and order_id is null;

  return greatest(0, v_capacity - v_sold - v_reserved);
end;
$$;

-- create_or_refresh_stock_reservation: skip the availability check for
-- unlimited types (they can never oversell). Limited types keep the exact
-- same guard. Reservations are still created for unlimited types so the
-- checkout countdown UI behaves uniformly.
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
  v_unlimited boolean;
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

  -- Anti-oversell guard — only for LIMITED types.
  select is_unlimited into v_unlimited
  from public.ticket_types
  where id = p_ticket_type_id;

  if not coalesce(v_unlimited, false) then
    v_available := public.get_available_stock(p_ticket_type_id) + v_existing;
    if v_available < p_quantity then
      raise exception 'insufficient_stock: available=% requested=%', v_available, p_quantity;
    end if;
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
