-- =============================================================
-- 0047 — Nombre por acompañante (attendee_name por entrada)
-- =============================================================
-- Hoy cada ticket emitido toma attendee_name = orders.buyer_name (el comprador,
-- repetido). Este cambio permite que el comprador escriba un nombre por entrada
-- en el checkout (opt-in por evento). Los nombres se congelan en order_items al
-- comprar y se asignan a cada ticket EN LA EMISIÓN (única fuente de verdad para
-- los 3 caminos: Yape diferido, MercadoPago webhook, gratis/cortesía).
--
-- COMPATIBILIDAD: el cambio en las RPCs de emisión es mínimo y NO altera el
-- comportamiento actual. Cuando no hay nombres capturados (attendee_names null
-- → columna default, evento sin opt-in), cae EXACTAMENTE al valor de antes
-- (buyer_name). No toca locks, gate de cupo, idempotencia ni montos.
--
-- OPT-IN por evento (events.collect_attendee_names, default false).
-- =============================================================

-- 1) Nombres por entrada, congelados al comprar (1 por unidad de quantity).
alter table public.order_items add column if not exists attendee_names text[];

-- 2) Toggle opt-in por evento (default OFF).
alter table public.events add column if not exists collect_attendee_names boolean not null default false;

-- 3) Emisión Yape / gratis / cortesía — recreada con asignación de nombre por
--    entrada (fallback a buyer_name → comportamiento idéntico si no hay nombres).
create or replace function public.issue_tickets_atomic(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_existing int;
  v_count int;
  v_cap jsonb;
begin
  -- Lock de la orden: serializa emisiones concurrentes de la MISMA orden.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'action', 'order_not_found');
  end if;

  -- Idempotencia atómica bajo el lock.
  select count(*) into v_existing from public.tickets where order_id = p_order_id;
  if v_existing > 0 then
    if v_order.status <> 'paid' then
      update public.orders set status = 'paid', paid_at = coalesce(paid_at, now()) where id = p_order_id;
      perform public.mark_promo_redemption_consumed(p_order_id);
    end if;
    return jsonb_build_object('ok', true, 'action', 'already_issued', 'ticket_count', v_existing);
  end if;

  -- GATE de cupo (backstop atómico): nunca emitir por encima del aforo.
  v_cap := public._order_capacity_overflow(p_order_id);
  if (v_cap->>'ok')::boolean is false then
    return jsonb_build_object('ok', false, 'action', 'oversold_no_capacity', 'detail', v_cap->'overflow');
  end if;

  if v_order.status <> 'paid' then
    update public.orders set status = 'paid', paid_at = now() where id = p_order_id;
  end if;
  perform public.mark_promo_redemption_consumed(p_order_id);

  insert into public.tickets
    (order_id, event_id, brand_id, ticket_type_id, ticket_type_name, ticket_number, attendee_name, max_scans)
  select v_order.id, v_order.event_id, v_order.brand_id, oi.ticket_type_id, oi.ticket_type_name,
         public._gen_ticket_number(),
         coalesce(nullif(btrim(coalesce(oi.attendee_names[gs.num], '')), ''), v_order.buyer_name),
         coalesce(tt.max_scans, 1)
    from public.order_items oi
         left join public.ticket_types tt on tt.id = oi.ticket_type_id
         cross join lateral generate_series(1, oi.quantity) as gs(num)
   where oi.order_id = p_order_id;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'action', 'no_items');
  end if;

  perform public.release_stock_reservations_for_order(p_order_id);

  return jsonb_build_object('ok', true, 'action', 'issued', 'ticket_count', v_count);
end;
$$;

-- 4) Emisión MercadoPago (webhook) — mismo cambio mínimo en el INSERT.
create or replace function public.settle_mp_payment(p_order_id uuid, p_brand_id uuid, p_payment_id text, p_status text, p_paid_amount_cents integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_existing int;
  v_count int;
  v_cap jsonb;
begin
  -- 1. Lock de la orden (tenancy: debe pertenecer al brand del webhook).
  select * into v_order from public.orders
   where id = p_order_id and brand_id = p_brand_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'action', 'order_not_found');
  end if;

  -- 2. Idempotencia (atómica bajo el lock): ¿ya hay tickets para esta orden?
  select count(*) into v_existing from public.tickets where order_id = p_order_id;
  if v_existing > 0 then
    if v_order.status <> 'paid' then
      update public.orders
         set status='paid', paid_at=coalesce(paid_at, now()),
             mp_payment_id=coalesce(mp_payment_id, p_payment_id), mp_payment_status=p_status
       where id = p_order_id;
    end if;
    return jsonb_build_object('ok', true, 'action', 'already_issued', 'ticket_count', v_existing);
  end if;

  -- 3. Solo órdenes MP en pending_payment (normal) o paid-sin-tickets (recovery).
  if v_order.payment_method <> 'mercadopago' then
    return jsonb_build_object('ok', false, 'action', 'not_mercadopago');
  end if;
  if v_order.status not in ('pending_payment', 'paid') then
    return jsonb_build_object('ok', false, 'action', 'not_settleable', 'status', v_order.status::text);
  end if;

  -- 4. CONTRASTE DE MONTO: lo pagado debe igualar el total congelado server-side.
  if p_paid_amount_cents is distinct from v_order.total_cents then
    return jsonb_build_object('ok', false, 'action', 'amount_mismatch',
      'expected_cents', v_order.total_cents, 'paid_cents', p_paid_amount_cents);
  end if;

  -- 4b. GATE de cupo atómico (backstop anti-oversell B2).
  v_cap := public._order_capacity_overflow(p_order_id);
  if (v_cap->>'ok')::boolean is false then
    if not exists (
      select 1 from public.events_log
      where order_id = p_order_id and type = 'oversold_no_capacity'
    ) then
      insert into public.events_log (brand_id, event_id, order_id, type, payload)
      values (v_order.brand_id, v_order.event_id, p_order_id, 'oversold_no_capacity',
              jsonb_build_object('flow','mp','payment_id',p_payment_id,'detail',v_cap->'overflow'));
    end if;
    return jsonb_build_object('ok', false, 'action', 'oversold_no_capacity', 'detail', v_cap->'overflow');
  end if;

  -- 5. Flip a paid (si no lo estaba ya). Sigue bajo FOR UPDATE → un solo ganador.
  if v_order.status <> 'paid' then
    update public.orders
       set status='paid', paid_at=now(), mp_payment_id=p_payment_id, mp_payment_status=p_status
     where id = p_order_id;
  end if;

  perform public.mark_promo_redemption_consumed(p_order_id);

  insert into public.tickets
    (order_id, event_id, brand_id, ticket_type_id, ticket_type_name, ticket_number, attendee_name, max_scans)
  select v_order.id, v_order.event_id, v_order.brand_id, oi.ticket_type_id, oi.ticket_type_name,
         public._gen_ticket_number(),
         coalesce(nullif(btrim(coalesce(oi.attendee_names[gs.num], '')), ''), v_order.buyer_name),
         coalesce(tt.max_scans, 1)
    from public.order_items oi
         left join public.ticket_types tt on tt.id = oi.ticket_type_id
         cross join lateral generate_series(1, oi.quantity) as gs(num)
   where oi.order_id = p_order_id;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'action', 'no_items');
  end if;

  perform public.release_stock_reservations_for_order(p_order_id);

  return jsonb_build_object('ok', true, 'action', 'issued',
    'ticket_count', v_count, 'expected_cents', v_order.total_cents);
end;
$$;

notify pgrst, 'reload schema';
