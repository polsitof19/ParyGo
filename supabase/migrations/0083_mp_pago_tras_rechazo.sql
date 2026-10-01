-- 0083 — Mercado Pago por marca: un pago APROBADO siempre entrega la entrada.
--
-- Bug: el comprador paga con tarjeta, MP rechaza el primer intento (el webhook
-- pasaba la orden a 'failed'), el comprador reintenta en el MISMO checkout de MP
-- (misma preferencia, mismo external_reference) y se aprueba. settle_mp_payment
-- solo aceptaba pending_payment/paid → 'not_settleable': plata cobrada y SIN
-- entrada. Ahora también liquida 'failed' y 'expired' (la orden nunca se cobró,
-- MP dice que ahora sí). El resto queda igual: lock de la orden, idempotencia,
-- contraste de monto contra el total congelado y gate de cupo (si ya no hay
-- cupo, oversold_no_capacity y el organizador devuelve, como siempre).
-- Si el promo de esa orden se había liberado, se vuelve a tomar: el comprador
-- pagó el total con descuento congelado (puede pasar el tope del código por
-- uno; la plata cobrada manda).
-- El webhook (app) ya no pasa a 'failed' un rechazo: el hold vence solo.

create or replace function public.settle_mp_payment(p_order_id uuid, p_brand_id uuid, p_payment_id text, p_status text, p_paid_amount_cents integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  -- 3. Solo órdenes MP no cobradas (pending_payment, failed, expired) o
  -- paid-sin-tickets (recovery). refunded y pending_yape_review no.
  if v_order.payment_method <> 'mercadopago' then
    return jsonb_build_object('ok', false, 'action', 'not_mercadopago');
  end if;
  if v_order.status not in ('pending_payment', 'paid', 'failed', 'expired') then
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

  -- Orden que había quedado failed/expired: su promo pudo liberarse. Se vuelve
  -- a tomar para que mark_promo_redemption_consumed la consuma.
  if v_order.status in ('failed', 'expired') then
    update public.promo_redemptions set status = 'held'
     where order_id = p_order_id and status = 'released';
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
$function$;

-- Service role only (lección 0014: revoke explícito de anon y authenticated).
revoke execute on function public.settle_mp_payment(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.settle_mp_payment(uuid, uuid, text, text, integer) to service_role;

-- Reembolso / contracargo de MP: la orden pasa a 'refunded' y sus entradas se
-- ANULAN en la misma transacción (antes el QR seguía entrando después de
-- devolver la plata). El trigger de tickets descuenta `sold` solo. Idempotente:
-- un reintento del webhook no hace nada. Una entrada ya escaneada también se
-- anula (queda la bitácora del escaneo).
create or replace function public.refund_mp_order(p_order_id uuid, p_brand_id uuid, p_status text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_anuladas int;
begin
  select * into v_order from public.orders
   where id = p_order_id and brand_id = p_brand_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'action', 'order_not_found');
  end if;
  if v_order.payment_method <> 'mercadopago' then
    return jsonb_build_object('ok', false, 'action', 'not_mercadopago');
  end if;
  -- Solo una orden cobrada se devuelve; nunca resucitar una failed como refunded.
  if v_order.status not in ('paid', 'refunded') then
    return jsonb_build_object('ok', false, 'action', 'not_paid', 'status', v_order.status::text);
  end if;

  if v_order.status = 'paid' then
    update public.orders set status = 'refunded', mp_payment_status = p_status where id = p_order_id;
  end if;
  update public.tickets set invalidated_at = now()
   where order_id = p_order_id and invalidated_at is null;
  get diagnostics v_anuladas = row_count;

  if v_anuladas > 0 or v_order.status = 'paid' then
    insert into public.events_log (brand_id, event_id, order_id, type, payload)
    values (v_order.brand_id, v_order.event_id, p_order_id, 'mp_refund_tickets_voided',
            jsonb_build_object('status', p_status, 'tickets_anuladas', v_anuladas));
  end if;
  return jsonb_build_object('ok', true, 'action', 'refunded', 'tickets_anuladas', v_anuladas);
end;
$function$;

revoke execute on function public.refund_mp_order(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.refund_mp_order(uuid, uuid, text) to service_role;
