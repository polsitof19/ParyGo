-- =============================================================
-- 0025 — settle_mp_payment: liquidación atómica del pago MercadoPago
-- (Sprint 4 · PASO 2.3 — webhook firmado + idempotente, el paso de mayor riesgo)
--
-- PROBLEMA: el pipeline anterior (markOrderPaid + issueTicketsForOrder en la app)
-- hacía SELECT-then-INSERT de tickets SIN lock → dos webhooks MP idénticos
-- SIMULTÁNEOS podían ambos ver "sin tickets" e insertar → TICKETS DUPLICADOS.
-- markOrderPaid tampoco tenía guard de estado.
--
-- SOLUCIÓN: una sola RPC que, bajo SELECT ... FOR UPDATE sobre la orden, hace
-- TODO el join dinero→ticket de forma ATÓMICA e IDEMPOTENTE:
--   1. Lock de la orden (serializa webhooks concurrentes de esa orden).
--   2. Idempotencia: si ya hay tickets para la orden → no re-emite.
--   3. Solo liquida órdenes MP en pending_payment (o paid-sin-tickets = recovery);
--      jamás resucita failed/expired/refunded ni toca órdenes Yape.
--   4. CONTRASTE DE MONTO: lo pagado debe == orders.total_cents (congelado
--      server-side: fase activa + promo). Si no coincide → NO emite (el llamador
--      hace log forense).
--   5. Flip a paid + consume la redención de promo + emite tickets + libera stock,
--      todo en la misma transacción bloqueada → exactamente UN ganador.
-- El email + el log forense quedan en la app (idempotentes), keyed por el
-- resultado de esta RPC. service_role-only (lockdown 0014). Idempotente.
-- =============================================================

-- Número de ticket legible para mostrar (el QR real es el uuid qr_code).
-- Mismo formato que generateTicketNumber() de la app: TKT/XXXX-XXXX.
create or replace function public._gen_ticket_number()
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  r text := '';
  i int;
begin
  for i in 1..8 loop
    r := r || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    if i = 4 then r := r || '-'; end if;
  end loop;
  return 'TKT/' || r;
end $$;

create or replace function public.settle_mp_payment(
  p_order_id uuid,
  p_brand_id uuid,
  p_payment_id text,
  p_status text,
  p_paid_amount_cents integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_existing int;
  v_count int;
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
    -- Asegura el bookkeeping de pago (cubre crash-after-issue), idempotente.
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

  -- 5. Flip a paid (si no lo estaba ya). Sigue bajo FOR UPDATE → un solo ganador.
  if v_order.status <> 'paid' then
    update public.orders
       set status='paid', paid_at=now(), mp_payment_id=p_payment_id, mp_payment_status=p_status
     where id = p_order_id;
  end if;

  -- Consume la redención de promo (held → consumed), idempotente.
  perform public.mark_promo_redemption_consumed(p_order_id);

  -- Emite tickets: uno por unidad de cantidad. qr_code default uuid_generate_v4().
  insert into public.tickets
    (order_id, event_id, brand_id, ticket_type_id, ticket_type_name, ticket_number, attendee_name)
  select v_order.id, v_order.event_id, v_order.brand_id, oi.ticket_type_id, oi.ticket_type_name,
         public._gen_ticket_number(), v_order.buyer_name
    from public.order_items oi
         cross join lateral generate_series(1, oi.quantity)
   where oi.order_id = p_order_id;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'action', 'no_items');
  end if;

  -- Libera reservas de stock retenidas (no-op si no hay).
  perform public.release_stock_reservations_for_order(p_order_id);

  return jsonb_build_object('ok', true, 'action', 'issued',
    'ticket_count', v_count, 'expected_cents', v_order.total_cents);
end $$;

-- Lockdown (lección 0014): solo service_role ejecuta.
revoke execute on function public._gen_ticket_number() from public, anon, authenticated;
revoke execute on function public.settle_mp_payment(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public._gen_ticket_number() to service_role;
grant execute on function public.settle_mp_payment(uuid, uuid, text, text, integer) to service_role;

notify pgrst, 'reload schema';
