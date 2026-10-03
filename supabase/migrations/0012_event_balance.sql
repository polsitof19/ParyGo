-- =============================================================
-- 0012 · Event balance (saldo de eventos por pack)
-- =============================================================
-- Each brand has an integer event balance. The super admin loads packs
-- (1/3/5/10 events) into it; creating an event consumes 1. Balance 0 blocks
-- creation. Both operations are atomic (race-safe) and audited in events_log.
--
-- Decision (Paul, 1 jun): Code starts at 3 and the pre-existing Almighty event
-- does NOT decrement retroactively (it was provisioned manually before this
-- system). The seed sets Code=3 with an absolute value and never touches
-- Almighty; the decrement only fires on NEW events created via the RPC.
--
-- RLS/grants: brands keeps full SELECT for `authenticated` (0005) so the
-- super admin reads event_balance; `anon` only has the explicit column grant
-- (event_balance excluded) — no changes needed. Both RPCs are SECURITY
-- DEFINER + service_role only (called from super-admin server actions).
--
-- Idempotent.
-- =============================================================

-- ------- 1. Column -------
alter table public.brands
  add column if not exists event_balance integer not null default 0
    check (event_balance >= 0);

-- ------- 2. consume_event_balance: atomic decrement + create event + log -------
-- One plpgsql function = one transaction: if the event insert fails (e.g. dup
-- slug 23505), the balance decrement rolls back. The conditional UPDATE
-- (where event_balance > 0) row-locks the brand, so two concurrent creates
-- with balance 1 can't both succeed. The event is passed as jsonb to avoid a
-- 13-arg signature; is_published is always forced false.
create or replace function public.consume_event_balance(
  p_brand_id      uuid,
  p_actor_user_id uuid,
  p_event         jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance int;
  v_event_id    uuid;
begin
  update public.brands
     set event_balance = event_balance - 1
   where id = p_brand_id
     and event_balance > 0
  returning event_balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  insert into public.events (
    brand_id, slug, name, description, starts_at, ends_at,
    venue_name, venue_address, venue_lat, venue_lng, min_age,
    refund_policy, is_published
  ) values (
    p_brand_id,
    p_event->>'slug',
    p_event->>'name',
    nullif(p_event->>'description', ''),
    (p_event->>'starts_at')::timestamptz,
    nullif(p_event->>'ends_at', '')::timestamptz,
    nullif(p_event->>'venue_name', ''),
    nullif(p_event->>'venue_address', ''),
    (p_event->>'venue_lat')::numeric,
    (p_event->>'venue_lng')::numeric,
    coalesce((p_event->>'min_age')::int, 18),
    nullif(p_event->>'refund_policy', ''),
    false
  )
  returning id into v_event_id;

  insert into public.events_log (brand_id, event_id, actor_user_id, type, payload)
  values (
    p_brand_id, v_event_id, p_actor_user_id, 'event_balance_consumed',
    jsonb_build_object('event_id', v_event_id, 'slug', p_event->>'slug', 'new_balance', v_new_balance)
  );

  return v_event_id;
end;
$$;

-- ------- 3. load_event_pack: atomic increment + log -------
create or replace function public.load_event_pack(
  p_brand_id      uuid,
  p_pack          integer,   -- 1|3|5|10
  p_added         integer,   -- = p_pack
  p_price_soles   integer,
  p_actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance int;
begin
  if p_pack not in (1, 3, 5, 10) or p_added <> p_pack then
    raise exception 'INVALID_PACK' using errcode = 'P0001';
  end if;

  update public.brands
     set event_balance = event_balance + p_added
   where id = p_brand_id
  returning event_balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'BRAND_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.events_log (brand_id, actor_user_id, type, payload)
  values (
    p_brand_id, p_actor_user_id, 'event_balance_pack_loaded',
    jsonb_build_object('pack', p_pack, 'added', p_added,
                       'price_soles', p_price_soles, 'new_balance', v_new_balance)
  );

  return v_new_balance;
end;
$$;

-- ------- 4. Grants (service_role only; called from super-admin actions) -------
revoke execute on function public.consume_event_balance(uuid, uuid, jsonb) from public;
revoke execute on function public.load_event_pack(uuid, integer, integer, integer, uuid) from public;
grant execute on function public.consume_event_balance(uuid, uuid, jsonb) to service_role;
grant execute on function public.load_event_pack(uuid, integer, integer, integer, uuid) to service_role;

-- ------- 5. Seed: Code starts at 3 (absolute, idempotent; Almighty untouched) -------
update public.brands
set event_balance = 3
where id = 'd11cd178-1e25-40bf-90c5-55471c98167a';
