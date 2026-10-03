-- =============================================================
-- 0018 · Promo codes (per-event discount codes)
-- =============================================================
-- Per-event codes (percent / fixed / free) created by the brand_admin. The
-- discount is computed SERVER-SIDE over the ACTIVE phase price
-- (get_event_active_prices, Sprint 1) and FROZEN into order_items, exactly
-- like the phase price. Usage is reserved at order creation (held), confirmed
-- on payment (consumed) and released on failure (released) — mirroring
-- stock_reservations. use_count is a derived cache (count of held+consumed).
--
-- Concurrency: apply_promo_to_order takes SELECT ... FOR UPDATE on the code
-- row, so two simultaneous checkouts of a max_uses=1 code → exactly one wins.
--
-- Lockdown (0014 lesson): all RPCs revoke EXECUTE from anon + authenticated.
-- Idempotent.
-- =============================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'promo_discount_type') then
    create type promo_discount_type as enum ('percent', 'fixed', 'free');
  end if;
  if not exists (select 1 from pg_type where typname = 'promo_redemption_status') then
    create type promo_redemption_status as enum ('held', 'consumed', 'released');
  end if;
end $$;

create table if not exists public.promo_codes (
  id              uuid primary key default uuid_generate_v4(),
  event_id        uuid not null references public.events(id) on delete cascade,
  brand_id        uuid not null references public.brands(id) on delete cascade,
  code            citext not null,
  label           text,
  discount_type   promo_discount_type not null,
  discount_value  integer not null,
  max_uses        integer,                                   -- null = unlimited
  use_count       integer not null default 0 check (use_count >= 0),
  per_email_limit integer not null default 1 check (per_email_limit >= 1),
  applies_to_all  boolean not null default true,
  expires_at      timestamptz,
  is_active       boolean not null default true,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint promo_codes_event_code_uniq unique (event_id, code),
  constraint promo_value_valid check (
    (discount_type = 'percent' and discount_value between 1 and 100) or
    (discount_type = 'fixed'   and discount_value >= 1) or
    (discount_type = 'free'    and discount_value = 0)
  ),
  constraint promo_code_format check (char_length(code::text) between 2 and 32)
);
create index if not exists promo_codes_event_idx on public.promo_codes (event_id);

create table if not exists public.promo_code_ticket_types (
  promo_code_id  uuid not null references public.promo_codes(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id) on delete cascade,
  primary key (promo_code_id, ticket_type_id)
);

create table if not exists public.promo_redemptions (
  id                    uuid primary key default uuid_generate_v4(),
  promo_code_id         uuid not null references public.promo_codes(id) on delete restrict,
  order_id              uuid not null references public.orders(id) on delete cascade,
  event_id              uuid not null references public.events(id) on delete cascade,
  brand_id              uuid not null references public.brands(id) on delete cascade,
  email                 citext not null,
  amount_discount_cents integer not null check (amount_discount_cents >= 0),
  status                promo_redemption_status not null default 'held',
  breakdown             jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint promo_redemptions_order_uniq unique (order_id)
);
create index if not exists promo_redemptions_active_code_idx
  on public.promo_redemptions (promo_code_id) where status in ('held', 'consumed');
create index if not exists promo_redemptions_active_email_idx
  on public.promo_redemptions (promo_code_id, email) where status in ('held', 'consumed');
create index if not exists promo_redemptions_event_idx on public.promo_redemptions (event_id);

alter table public.orders add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null;
alter table public.orders add column if not exists discount_cents integer not null default 0 check (discount_cents >= 0);

drop trigger if exists promo_codes_updated_at on public.promo_codes;
create trigger promo_codes_updated_at before update on public.promo_codes for each row execute function bump_updated_at();
drop trigger if exists promo_redemptions_updated_at on public.promo_redemptions;
create trigger promo_redemptions_updated_at before update on public.promo_redemptions for each row execute function bump_updated_at();

-- ------- RLS -------
alter table public.promo_codes enable row level security;
alter table public.promo_code_ticket_types enable row level security;
alter table public.promo_redemptions enable row level security;

drop policy if exists promo_codes_read on public.promo_codes;
create policy promo_codes_read on public.promo_codes for select to authenticated
  using (is_super_admin() or user_is_brand_member(brand_id, 'brand_admin'));
drop policy if exists pctt_read on public.promo_code_ticket_types;
create policy pctt_read on public.promo_code_ticket_types for select to authenticated
  using (exists (select 1 from public.promo_codes pc where pc.id = promo_code_id
    and (is_super_admin() or user_is_brand_member(pc.brand_id, 'brand_admin'))));
drop policy if exists promo_redemptions_read on public.promo_redemptions;
create policy promo_redemptions_read on public.promo_redemptions for select to authenticated
  using (is_super_admin() or user_is_brand_member(brand_id, 'brand_admin'));

-- ------- breakdown helper (discount over ACTIVE phase price) -------
create or replace function public._compute_promo_breakdown(v_promo public.promo_codes, p_event_id uuid, p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_item jsonb; v_tt_id uuid; v_qty int; v_base int; v_final int; v_covered boolean;
  v_total_base int := 0; v_total_final int := 0; v_breakdown jsonb := '[]'::jsonb; v_applies_any boolean := false;
begin
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tt_id := (v_item->>'ticket_type_id')::uuid;
    v_qty   := greatest((v_item->>'quantity')::int, 0);
    select active_price_cents into v_base from public.get_event_active_prices(p_event_id) where ticket_type_id = v_tt_id;
    if v_base is null then return jsonb_build_object('ok', false, 'reason', 'BAD_TICKET_TYPE'); end if;
    v_covered := v_promo.applies_to_all or exists (
      select 1 from public.promo_code_ticket_types where promo_code_id = v_promo.id and ticket_type_id = v_tt_id);
    if v_covered then
      v_applies_any := true;
      v_final := case v_promo.discount_type
        when 'free'    then 0
        when 'percent' then greatest(0, round(v_base * (100 - v_promo.discount_value) / 100.0))::int
        when 'fixed'   then greatest(0, v_base - v_promo.discount_value) end;
    else
      v_final := v_base;
    end if;
    v_total_base  := v_total_base  + v_base  * v_qty;
    v_total_final := v_total_final + v_final * v_qty;
    v_breakdown := v_breakdown || jsonb_build_object('ticket_type_id', v_tt_id, 'quantity', v_qty,
      'base_cents', v_base, 'final_cents', v_final, 'covered', v_covered);
  end loop;
  if not v_applies_any then return jsonb_build_object('ok', false, 'reason', 'NOT_APPLICABLE'); end if;
  return jsonb_build_object('ok', true, 'promo_code_id', v_promo.id, 'discount_type', v_promo.discount_type,
    'is_free', (v_total_final = 0), 'total_base_cents', v_total_base, 'total_final_cents', v_total_final,
    'total_discount_cents', v_total_base - v_total_final, 'breakdown', v_breakdown);
end; $$;

-- ------- preview (read-only, optimistic) -------
create or replace function public.preview_promo(p_event_id uuid, p_code citext, p_email citext, p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_promo public.promo_codes%rowtype;
begin
  select * into v_promo from public.promo_codes where event_id = p_event_id and code = p_code and is_active = true;
  if not found then return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND'); end if;
  if v_promo.expires_at is not null and v_promo.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'EXPIRED'); end if;
  if v_promo.max_uses is not null and (select count(*) from public.promo_redemptions
      where promo_code_id = v_promo.id and status in ('held','consumed')) >= v_promo.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'EXHAUSTED'); end if;
  if (select count(*) from public.promo_redemptions
      where promo_code_id = v_promo.id and email = lower(p_email) and status in ('held','consumed')) >= v_promo.per_email_limit then
    return jsonb_build_object('ok', false, 'reason', 'EMAIL_LIMIT'); end if;
  return public._compute_promo_breakdown(v_promo, p_event_id, p_items);
end; $$;

-- ------- apply (atomic, FOR UPDATE, consumes held + rewrites order) -------
create or replace function public.apply_promo_to_order(p_order_id uuid, p_event_id uuid, p_code citext, p_email citext, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_promo public.promo_codes%rowtype; v_result jsonb; v_uses int; v_email_uses int; v_item jsonb;
begin
  select * into v_promo from public.promo_codes where event_id = p_event_id and code = p_code and is_active = true for update;
  if not found then raise exception 'PROMO_NOT_FOUND' using errcode='P0001'; end if;
  if v_promo.expires_at is not null and v_promo.expires_at <= now() then raise exception 'PROMO_EXPIRED' using errcode='P0001'; end if;
  if v_promo.max_uses is not null then
    select count(*) into v_uses from public.promo_redemptions where promo_code_id = v_promo.id and status in ('held','consumed') and order_id <> p_order_id;
    if v_uses >= v_promo.max_uses then raise exception 'PROMO_EXHAUSTED' using errcode='P0001'; end if;
  end if;
  select count(*) into v_email_uses from public.promo_redemptions where promo_code_id = v_promo.id and email = lower(p_email) and status in ('held','consumed') and order_id <> p_order_id;
  if v_email_uses >= v_promo.per_email_limit then raise exception 'PROMO_EMAIL_LIMIT' using errcode='P0001'; end if;

  v_result := public._compute_promo_breakdown(v_promo, p_event_id, p_items);
  if (v_result->>'ok')::boolean is not true then raise exception 'PROMO_NOT_APPLICABLE:%', coalesce(v_result->>'reason','?') using errcode='P0001'; end if;

  for v_item in select * from jsonb_array_elements(v_result->'breakdown') loop
    update public.order_items set unit_price_cents = (v_item->>'final_cents')::int,
      subtotal_cents = (v_item->>'final_cents')::int * (v_item->>'quantity')::int
     where order_id = p_order_id and ticket_type_id = (v_item->>'ticket_type_id')::uuid;
  end loop;

  update public.orders set promo_code_id = v_promo.id, discount_cents = (v_result->>'total_discount_cents')::int,
    subtotal_cents = (v_result->>'total_base_cents')::int, total_cents = (v_result->>'total_final_cents')::int
   where id = p_order_id;

  insert into public.promo_redemptions (promo_code_id, order_id, event_id, brand_id, email, amount_discount_cents, status, breakdown)
  values (v_promo.id, p_order_id, p_event_id, v_promo.brand_id, lower(p_email), (v_result->>'total_discount_cents')::int, 'held', v_result->'breakdown')
  on conflict (order_id) do update set promo_code_id = excluded.promo_code_id, amount_discount_cents = excluded.amount_discount_cents,
    status = 'held', breakdown = excluded.breakdown, email = excluded.email;

  update public.promo_codes set use_count = (select count(*) from public.promo_redemptions where promo_code_id = v_promo.id and status in ('held','consumed')) where id = v_promo.id;
  return v_result || jsonb_build_object('promo_code_id', v_promo.id);
end; $$;

create or replace function public.mark_promo_redemption_consumed(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_code uuid;
begin
  update public.promo_redemptions set status = 'consumed' where order_id = p_order_id and status = 'held' returning promo_code_id into v_code;
  if v_code is not null then
    update public.promo_codes set use_count = (select count(*) from public.promo_redemptions where promo_code_id = v_code and status in ('held','consumed')) where id = v_code;
  end if;
end; $$;

create or replace function public.release_promo_redemption_for_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_code uuid;
begin
  update public.promo_redemptions set status = 'released' where order_id = p_order_id and status = 'held' returning promo_code_id into v_code;
  if v_code is not null then
    update public.promo_codes set use_count = (select count(*) from public.promo_redemptions where promo_code_id = v_code and status in ('held','consumed')) where id = v_code;
  end if;
end; $$;

-- ------- create_promo_code (atomic: code + bridge rows) -------
create or replace function public.create_promo_code(
  p_event_id uuid, p_brand_id uuid, p_code citext, p_label text, p_discount_type promo_discount_type,
  p_discount_value int, p_max_uses int, p_per_email_limit int, p_applies_to_all boolean,
  p_ticket_type_ids uuid[], p_expires_at timestamptz, p_created_by uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tt uuid;
begin
  insert into public.promo_codes (event_id, brand_id, code, label, discount_type, discount_value, max_uses, per_email_limit, applies_to_all, expires_at, created_by)
  values (p_event_id, p_brand_id, p_code, nullif(p_label,''), p_discount_type, p_discount_value,
          p_max_uses, coalesce(p_per_email_limit,1), p_applies_to_all, p_expires_at, p_created_by)
  returning id into v_id;
  if not p_applies_to_all and p_ticket_type_ids is not null then
    foreach v_tt in array p_ticket_type_ids loop
      insert into public.promo_code_ticket_types (promo_code_id, ticket_type_id) values (v_id, v_tt) on conflict do nothing;
    end loop;
  end if;
  return v_id;
end; $$;

-- ------- Lockdown (0014 lesson) -------
revoke execute on function public.preview_promo(uuid, citext, citext, jsonb) from public, anon, authenticated;
revoke execute on function public.apply_promo_to_order(uuid, uuid, citext, citext, jsonb) from public, anon, authenticated;
revoke execute on function public._compute_promo_breakdown(public.promo_codes, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.mark_promo_redemption_consumed(uuid) from public, anon, authenticated;
revoke execute on function public.release_promo_redemption_for_order(uuid) from public, anon, authenticated;
revoke execute on function public.create_promo_code(uuid, uuid, citext, text, promo_discount_type, int, int, int, boolean, uuid[], timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.preview_promo(uuid, citext, citext, jsonb) to service_role;
grant execute on function public.apply_promo_to_order(uuid, uuid, citext, citext, jsonb) to service_role;
grant execute on function public.mark_promo_redemption_consumed(uuid) to service_role;
grant execute on function public.release_promo_redemption_for_order(uuid) to service_role;
grant execute on function public.create_promo_code(uuid, uuid, citext, text, promo_discount_type, int, int, int, boolean, uuid[], timestamptz, uuid) to service_role;
