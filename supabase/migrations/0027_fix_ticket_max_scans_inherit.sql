-- =============================================================
-- 0027 — Fix B1: el ticket debe HEREDAR max_scans de su ticket_type
-- =============================================================
-- BUG (auditoría B1): ningún camino de emisión copiaba ticket_types.max_scans
-- al ticket. La columna tickets.max_scans (0015) no tiene default, así que cada
-- ticket emitido tras 0015 nacía NULL, y validate_ticket (0015:137) trata
-- max_scans NULL como ILIMITADO → cada QR entraba infinitas veces a la puerta.
--
-- FIX:
--   1. settle_mp_payment (MercadoPago): el insert...select ahora copia
--      coalesce(tt.max_scans, 1). LEFT JOIN para no alterar el conteo de
--      emisión si un tipo fue borrado (cae al default 1). Sin otro cambio de
--      lógica (lock/idempotencia/contraste de monto intactos).
--   2. El camino Yape/promo (lib/tickets.ts) se arregla en la app (mismo
--      coalesce(...,1)).
--   3. Backfill: setear max_scans en los tickets ya emitidos que estén NULL,
--      tomándolo de su tipo (default 1 si el tipo es NULL o ya no existe).
--
-- DEFAULT-DENY: un tipo con max_scans NULL (convención 0015 "ilimitado para
-- staff/cortesía") cae a 1 en la emisión. Es deliberado: prioriza el control de
-- puerta sobre la feature de pase ilimitado, que hoy NO se usa (todos los tipos
-- existentes tienen max_scans=1). Si se quiere un pase ilimitado en el futuro
-- debe implementarse explícitamente.
--
-- NO toca: validate_ticket (su FOR UPDATE ya es correcto), precios, apply_promo,
-- RLS base. service_role-only (lockdown 0014). Idempotente.
-- =============================================================

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
  -- El ticket HEREDA max_scans del tipo (coalesce(...,1) = default-deny). LEFT
  -- JOIN para no perder filas si el tipo fue borrado (cae a 1).
  insert into public.tickets
    (order_id, event_id, brand_id, ticket_type_id, ticket_type_name, ticket_number, attendee_name, max_scans)
  select v_order.id, v_order.event_id, v_order.brand_id, oi.ticket_type_id, oi.ticket_type_name,
         public._gen_ticket_number(), v_order.buyer_name, coalesce(tt.max_scans, 1)
    from public.order_items oi
         left join public.ticket_types tt on tt.id = oi.ticket_type_id
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

-- Lockdown (lección 0014): re-aplicar explícito tras CREATE OR REPLACE.
revoke execute on function public.settle_mp_payment(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.settle_mp_payment(uuid, uuid, text, text, integer) to service_role;

-- ------- Backfill de tickets ya emitidos con max_scans NULL -------
-- (a) Heredar del tipo cuando existe.
update public.tickets t
set max_scans = coalesce(tt.max_scans, 1)
from public.ticket_types tt
where tt.id = t.ticket_type_id
  and t.max_scans is null;
-- (b) Default 1 para cualquier resto sin tipo (FK rota). Idempotente.
update public.tickets
set max_scans = 1
where max_scans is null;

notify pgrst, 'reload schema';
