-- =============================================================
-- 0019 — Promo adjustments (Sprint 4 PASO 1 follow-up)
--   1. FIXED discount is now PER ORDER (not per unit). A "S/10" code takes
--      S/10 off the order total, distributed across covered lines, clamped
--      to the covered base so the order never goes negative.
--   2. The pg_cron sweep that frees abandoned stock reservations now ALSO
--      releases `held` promo_redemptions of abandoned / terminal orders, so a
--      capped code (max_uses) is not exhausted by checkouts that never pay.
-- All functions are `create or replace`: existing GRANT/REVOKE ACLs are
-- preserved by Postgres. We re-assert the lockdown explicitly anyway (0014).
-- =============================================================

-- -------------------------------------------------------------
-- 1. _compute_promo_breakdown — fixed = per-order, distributed
-- -------------------------------------------------------------
create or replace function public._compute_promo_breakdown(v_promo public.promo_codes, p_event_id uuid, p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_item jsonb; v_tt_id uuid; v_qty int; v_base int; v_covered boolean;
  v_total_base int := 0;        -- base of the WHOLE order (all items)
  v_covered_base int := 0;      -- base of covered items only
  v_covered_count int := 0;     -- number of covered lines (qty>0 not required for share)
  v_applies_any boolean := false;
  v_lines jsonb := '[]'::jsonb; v_line jsonb;
  v_line_base int; v_line_qty int; v_line_disc int; v_line_final_sub int; v_line_unit_final int;
  v_fixed_total int := 0;       -- clamped fixed amount to distribute
  v_fixed_alloc int := 0;       -- running allocated so far
  v_covered_idx int := 0;
  v_total_final int := 0;
  v_breakdown jsonb := '[]'::jsonb;
  v_disc_value int := v_promo.discount_value;
begin
  -- pass 1: resolve active prices, classify covered/uncovered, sum bases.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tt_id := (v_item->>'ticket_type_id')::uuid;
    v_qty   := greatest((v_item->>'quantity')::int, 0);
    select active_price_cents into v_base from public.get_event_active_prices(p_event_id) where ticket_type_id = v_tt_id;
    if v_base is null then return jsonb_build_object('ok', false, 'reason', 'BAD_TICKET_TYPE'); end if;
    v_covered := v_promo.applies_to_all or exists (
      select 1 from public.promo_code_ticket_types where promo_code_id = v_promo.id and ticket_type_id = v_tt_id);
    if v_covered and v_qty > 0 then
      v_applies_any := true;
      v_covered_count := v_covered_count + 1;
      v_covered_base := v_covered_base + v_base * v_qty;
    end if;
    v_total_base := v_total_base + v_base * v_qty;
    v_lines := v_lines || jsonb_build_object('ticket_type_id', v_tt_id, 'quantity', v_qty, 'base', v_base, 'covered', (v_covered and v_qty > 0));
  end loop;
  if not v_applies_any then return jsonb_build_object('ok', false, 'reason', 'NOT_APPLICABLE'); end if;

  -- For fixed: the discount is a single per-order amount, clamped to covered base.
  if v_promo.discount_type = 'fixed' then
    v_fixed_total := least(v_disc_value, v_covered_base);
  end if;

  -- pass 2: per-line final amounts.
  for v_line in select * from jsonb_array_elements(v_lines) loop
    v_line_base := (v_line->>'base')::int;
    v_line_qty  := (v_line->>'quantity')::int;
    v_covered   := (v_line->>'covered')::boolean;
    if not v_covered then
      v_line_final_sub := v_line_base * v_line_qty;
      v_line_unit_final := v_line_base;
    else
      case v_promo.discount_type
        when 'free' then
          v_line_final_sub := 0; v_line_unit_final := 0;
        when 'percent' then
          v_line_unit_final := greatest(0, round(v_line_base * (100 - v_disc_value) / 100.0))::int;
          v_line_final_sub  := v_line_unit_final * v_line_qty;
        when 'fixed' then
          v_covered_idx := v_covered_idx + 1;
          if v_covered_idx = v_covered_count then
            -- last covered line absorbs the exact remainder → Σ disc == fixed_total
            v_line_disc := v_fixed_total - v_fixed_alloc;
          else
            v_line_disc := floor(v_fixed_total::numeric * (v_line_base * v_line_qty) / v_covered_base)::int;
          end if;
          v_line_disc := greatest(0, least(v_line_disc, v_line_base * v_line_qty));
          v_fixed_alloc := v_fixed_alloc + v_line_disc;
          v_line_final_sub  := (v_line_base * v_line_qty) - v_line_disc;
          v_line_unit_final := case when v_line_qty > 0 then round(v_line_final_sub::numeric / v_line_qty)::int else 0 end;
      end case;
    end if;
    v_total_final := v_total_final + v_line_final_sub;
    v_breakdown := v_breakdown || jsonb_build_object(
      'ticket_type_id', v_line->>'ticket_type_id', 'quantity', v_line_qty,
      'base_cents', v_line_base, 'final_cents', v_line_unit_final,
      'final_subtotal_cents', v_line_final_sub, 'covered', v_covered);
  end loop;

  return jsonb_build_object('ok', true, 'promo_code_id', v_promo.id, 'discount_type', v_promo.discount_type,
    'is_free', (v_total_final = 0), 'total_base_cents', v_total_base, 'total_final_cents', v_total_final,
    'total_discount_cents', v_total_base - v_total_final, 'breakdown', v_breakdown);
end; $$;

-- -------------------------------------------------------------
-- 2. apply_promo_to_order — use the per-line final SUBTOTAL from the
--    breakdown (fixed distribution may make unit*qty != subtotal by the
--    rounding cents, so the subtotal is authoritative).
--
-- HARDENING PENDIENTE (M1): esta función confía en `p_items` que le pasa el
-- llamador para recomputar el descuento y reescribir order_items + el total de
-- la orden. HOY es seguro porque el ÚNICO llamador (startCheckout, server
-- action) arma p_items desde datos server-trusted (precios resueltos en el
-- servidor, no del cliente). CONDICIÓN EXPLÍCITA: blindar ANTES de agregar
-- cualquier SEGUNDO llamador (app móvil, otro endpoint, webhook MP, etc.) —
-- derivar los items de order_items (where order_id = p_order_id) en vez de
-- aceptarlos, o validar que p_items == los items reales de la orden.
-- -------------------------------------------------------------
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
      subtotal_cents = (v_item->>'final_subtotal_cents')::int
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

-- -------------------------------------------------------------
-- 3. cleanup_expired_reservations — now ALSO releases orphaned `held`
--    promo redemptions and recomputes use_count for affected codes.
--    "Abandoned" = order is terminal (failed/expired) OR has been sitting in
--    pending_payment past the 30-min reservation window. We never touch
--    pending_yape_review (a promoter may still approve it) or paid/refunded.
-- -------------------------------------------------------------
create or replace function public.cleanup_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_codes uuid[];
begin
  -- (a) garbage-collect expired, unattached stock reservations (unchanged).
  delete from public.stock_reservations
  where expires_at < now()
    and order_id is null;
  get diagnostics v_count = row_count;

  -- (b) release `held` promo redemptions of abandoned / terminal orders.
  with released as (
    update public.promo_redemptions r
       set status = 'released'
      from public.orders o
     where r.order_id = o.id
       and r.status = 'held'
       and (
         o.status in ('failed','expired')
         or (o.status = 'pending_payment' and o.created_at < now() - interval '30 minutes')
       )
    returning r.promo_code_id
  )
  select array_agg(distinct promo_code_id) into v_codes from released;

  -- (c) recompute use_count for the affected codes so the freed slot reopens.
  if v_codes is not null then
    update public.promo_codes c
       set use_count = (select count(*) from public.promo_redemptions r
                         where r.promo_code_id = c.id and r.status in ('held','consumed'))
     where c.id = any(v_codes);
  end if;

  return v_count;
end;
$$;

-- Re-assert lockdown (idempotent; create-or-replace preserves ACL, this is belt-and-suspenders per the 0014 lesson).
revoke execute on function public._compute_promo_breakdown(public.promo_codes, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.apply_promo_to_order(uuid, uuid, citext, citext, jsonb) from public, anon, authenticated;
revoke execute on function public.cleanup_expired_reservations() from public, anon, authenticated;
grant execute on function public.apply_promo_to_order(uuid, uuid, citext, citext, jsonb) to service_role;
grant execute on function public.cleanup_expired_reservations() to service_role;
