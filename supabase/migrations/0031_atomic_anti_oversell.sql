-- =============================================================
-- 0031 — Anti-oversell ATÓMICO (Fase 2 de escala · auditoría B2). DINERO/STOCK.
-- =============================================================
-- PROBLEMA (alto volumen, aforo CERRADO): tomar un cupo NO era atómico. Tres
-- ventanas de carrera permitían vender de más (gente que paga y no entra):
--
--   (1) startCheckout chequeaba `capacity - sold` (app) SIN lock, SIN restar
--       reservas y SIN exigir una reserva válida. N compras simultáneas leen
--       "hay lugar" a la vez y todas pasan.
--   (2) create_or_refresh_stock_reservation: get_available_stock (SELECT sin
--       lock) luego INSERT → TOCTOU. Dos sesiones leen "hay 1" y ambas reservan.
--   (3) get_available_stock contaba SOLO reservas con order_id IS NULL. Apenas
--       se creaba la orden y se ataba la reserva (order_id set), el cupo se
--       volvía INVISIBLE (ni sold ni reserved) → otra compra lo tomaba.
--   (4) La emisión post-pago (settle_mp_payment / issueTicketsForOrder) NO
--       re-chequeaba aforo: si la reserva expiró y el cupo se revendió antes de
--       que llegue el pago, emitía por encima del cupo.
--
-- MECANISMO ELEGIDO (el más robusto y simple de razonar para ESTE código):
--   LEDGER (tabla stock_reservations, única fuente de verdad de "quién retiene
--   qué") + disciplina de LOCK: TODA decisión de stock de un ticket_type se
--   serializa con `SELECT ... FROM ticket_types WHERE id=X FOR UPDATE`. No se
--   usa un contador en columna (la columna `reserved` queda muerta): un contador
--   sería una SEGUNDA fuente de verdad que puede driftar en el sweep/attach/
--   release — exactamente el bug que evitamos. La disponibilidad SIEMPRE se
--   recomputa = capacity - sold - sum(reservas activas), bajo el lock de la fila.
--   El trigger de `sold` también toma ese row-lock al UPDATE → emisión y reserva
--   serializan en la MISMA fila. Invariante: imposible que dos decisiones vean
--   el mismo último lugar.
--
-- GARANTÍA EN CAPAS:
--   · reserve_order_stock (gate de checkout, atómico): evita la sobre-suscripción
--     en la compra → en el caso normal nadie paga por un cupo inexistente.
--   · _order_capacity_overflow (gate de EMISIÓN, atómico): tope DURO — los
--     tickets EMITIDOS nunca superan capacity, pase lo que pase. Atrapa el edge
--     de expiración. Si excede → NO emite y se marca para reembolso/manual.
--
-- ILIMITADOS (is_unlimited, p.ej. Almighty): camino INTACTO. get_available_stock
--   sigue devolviendo "infinito", create_or_refresh no chequea ni lockea (no
--   serializa las filas calientes de Almighty), reserve_order_stock y los gates
--   de emisión los EXCLUYEN. Cero cambios de comportamiento para ilimitados.
--
-- NO toca: validate_ticket, el webhook MP (HMAC/anti-replay del route),
--   apply_promo, precio congelado, max_scans (lo respeta: coalesce(...,1)), RLS
--   base, archivado. Lockdown 0014 reaplicado a cada función. Idempotente.
-- =============================================================

-- -------------------------------------------------------------
-- (1) get_available_stock — ahora cuenta TODA reserva activa (picker con
-- order_id null + retenida por orden en vuelo). Cierra la ventana (3).
-- Ilimitados: sin cambio (devuelve "infinito").
-- -------------------------------------------------------------
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
    return 1000000000;  -- effectively infinite (sin cambio)
  end if;

  -- Cuenta TODA reserva activa, con o sin order_id. Antes: `and order_id is null`
  -- → una orden en vuelo volvía su cupo invisible y se revendía (ventana 3).
  select coalesce(sum(quantity), 0)::int into v_reserved
  from public.stock_reservations
  where ticket_type_id = p_ticket_type_id
    and expires_at > now();

  return greatest(0, v_capacity - v_sold - v_reserved);
end;
$$;

-- -------------------------------------------------------------
-- (2) create_or_refresh_stock_reservation — picker UI. Ahora LOCKEA la fila del
-- tipo (solo limitados) antes de medir → cierra el TOCTOU (ventana 2). Mismo
-- contrato. Ilimitados: NO lockean (no serializan las filas calientes) ni
-- chequean (camino intacto).
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

  select is_unlimited into v_unlimited
  from public.ticket_types
  where id = p_ticket_type_id;

  -- Anti-oversell guard — SOLO para tipos LIMITADOS.
  if not coalesce(v_unlimited, false) then
    -- LOCK de la fila del tipo: serializa toda decisión de stock de este tipo.
    -- Sin esto el SELECT (get_available_stock) y el INSERT eran un TOCTOU.
    perform 1 from public.ticket_types where id = p_ticket_type_id for update;

    select coalesce(quantity, 0) into v_existing
    from public.stock_reservations
    where session_id = p_session_id
      and ticket_type_id = p_ticket_type_id
      and order_id is null;
    v_existing := coalesce(v_existing, 0);

    -- available_para_mi = capacity - sold - (reservas de otros, incl. en vuelo).
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

-- -------------------------------------------------------------
-- (3) reserve_order_stock(p_order_id, p_session_id) — NUEVO. El GATE atómico del
-- checkout. Reemplaza el chequeo no-atómico de startCheckout (ventana 1) y al
-- viejo attach_reservation_to_order. Deriva las cantidades de order_items
-- (server-trusted, ya insertados); NO confía en cantidades del cliente ni en que
-- el picker haya reservado. Lockea las filas de tipo LIMITADO involucradas (orden
-- por id → sin deadlock), valida cupo contra reservas de OTROS, y fija los holds
-- atados a la orden. Si algún tipo no alcanza → raise (nada se inserta; atómico).
-- Ilimitados: excluidos (no reserva, no chequea).
-- -------------------------------------------------------------
create or replace function public.reserve_order_stock(
  p_order_id uuid,
  p_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_ttid uuid;
  v_reserved_others int;
  v_available int;
  v_expires timestamptz := now() + interval '30 minutes';
begin
  if p_session_id is null or length(p_session_id) < 8 then
    raise exception 'invalid session_id';
  end if;

  -- PASO 0: lockear FOR UPDATE las filas de los tipos LIMITADOS de la orden, UNA
  -- POR UNA en orden ascendente de id (orden de adquisición de lock GARANTIZADO →
  -- imposible deadlock entre órdenes multi-tipo o contra el gate de emisión, que
  -- usa el MISMO orden). Un loop explícito es la garantía dura; `ORDER BY ... FOR
  -- UPDATE` sobre un IN(subselect) no asegura el orden de locking en todo plan.
  for v_ttid in
    select distinct oi.ticket_type_id
    from public.order_items oi
    join public.ticket_types t2 on t2.id = oi.ticket_type_id
    where oi.order_id = p_order_id and t2.is_unlimited = false
    order by oi.ticket_type_id
  loop
    perform 1 from public.ticket_types where id = v_ttid for update;
  end loop;

  -- PASO 1: validar cupo por tipo (agregado por tipo, por si vinieron 2 líneas
  -- del mismo tipo). sold se lee bajo el lock → estable.
  for v_rec in
    select oi.ticket_type_id as ttid, sum(oi.quantity)::int as qty,
           tt.capacity as capacity, tt.sold as sold
    from public.order_items oi
    join public.ticket_types tt on tt.id = oi.ticket_type_id
    where oi.order_id = p_order_id and tt.is_unlimited = false
    group by oi.ticket_type_id, tt.capacity, tt.sold
  loop
    -- Reservas activas de OTROS: excluye lo ya atado a ESTA orden (retries
    -- idempotentes) y el hold null de ESTA sesión (lo estamos por convertir).
    select coalesce(sum(quantity), 0)::int into v_reserved_others
    from public.stock_reservations
    where ticket_type_id = v_rec.ttid
      and expires_at > now()
      and order_id is distinct from p_order_id
      and not (session_id = p_session_id and order_id is null);

    v_available := v_rec.capacity - v_rec.sold - v_reserved_others;
    if v_available < v_rec.qty then
      raise exception 'insufficient_stock: type=% available=% requested=%',
        v_rec.ttid, greatest(0, v_available), v_rec.qty;
    end if;
  end loop;

  -- PASO 2: validado bajo lock → fijar los holds atados a la orden (TTL 30 min).
  -- on conflict convierte el hold del picker (order_id null) en hold de la orden.
  insert into public.stock_reservations
    (ticket_type_id, quantity, session_id, order_id, expires_at)
  select oi.ticket_type_id, sum(oi.quantity)::int, p_session_id, p_order_id, v_expires
  from public.order_items oi
  join public.ticket_types tt on tt.id = oi.ticket_type_id
  where oi.order_id = p_order_id and tt.is_unlimited = false
  group by oi.ticket_type_id
  on conflict (session_id, ticket_type_id) do update
    set quantity = excluded.quantity,
        order_id = excluded.order_id,
        expires_at = excluded.expires_at;

  return jsonb_build_object('ok', true);
end;
$$;

-- -------------------------------------------------------------
-- (4) _order_capacity_overflow(p_order_id) — NUEVO. Gate de EMISIÓN. Bajo lock de
-- los tipos LIMITADOS de la orden, devuelve si emitir excedería el aforo
-- (sold + qty > capacity por tipo). Lo llaman issue_tickets_atomic y
-- settle_mp_payment DENTRO de su transacción bloqueada → los locks persisten
-- hasta el commit. Ilimitados: excluidos. Tope DURO sobre tickets emitidos.
-- -------------------------------------------------------------
create or replace function public._order_capacity_overflow(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_over jsonb := '[]'::jsonb;
  v_rec record;
  v_ttid uuid;
begin
  -- Lockear los tipos LIMITADOS de la orden UNA POR UNA en orden ascendente de id
  -- (mismo orden que reserve_order_stock → sin deadlock cruzado).
  for v_ttid in
    select distinct oi.ticket_type_id
    from public.order_items oi
    join public.ticket_types t2 on t2.id = oi.ticket_type_id
    where oi.order_id = p_order_id and t2.is_unlimited = false
    order by oi.ticket_type_id
  loop
    perform 1 from public.ticket_types where id = v_ttid for update;
  end loop;

  for v_rec in
    select oi.ticket_type_id as ttid, sum(oi.quantity)::int as qty,
           tt.capacity as capacity, tt.sold as sold
    from public.order_items oi
    join public.ticket_types tt on tt.id = oi.ticket_type_id
    where oi.order_id = p_order_id and tt.is_unlimited = false
    group by oi.ticket_type_id, tt.capacity, tt.sold
  loop
    if v_rec.sold + v_rec.qty > v_rec.capacity then
      v_over := v_over || jsonb_build_object(
        'ticket_type_id', v_rec.ttid, 'capacity', v_rec.capacity,
        'sold', v_rec.sold, 'requested', v_rec.qty);
    end if;
  end loop;

  if jsonb_array_length(v_over) > 0 then
    return jsonb_build_object('ok', false, 'overflow', v_over);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- -------------------------------------------------------------
-- (5) issue_tickets_atomic(p_order_id) — NUEVO. Emisión ATÓMICA e idempotente
-- para los caminos Yape (aprobación manual) y promo-free. Mismo blindaje que
-- settle_mp_payment (que es el camino MP): lock de la orden (serializa doble
-- click / doble disparo), idempotencia por tickets existentes, GATE de cupo,
-- insert (1 ticket por unidad, hereda max_scans coalesce(...,1)), release de
-- reservas. NO toca order.status ni campos de pago (eso lo maneja el caller).
-- Devuelve action: issued | already_issued | oversold_no_capacity | order_not_found | no_items.
-- -------------------------------------------------------------
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
    return jsonb_build_object('ok', true, 'action', 'already_issued', 'ticket_count', v_existing);
  end if;

  -- GATE de cupo (backstop atómico): nunca emitir por encima del aforo.
  v_cap := public._order_capacity_overflow(p_order_id);
  if (v_cap->>'ok')::boolean is false then
    return jsonb_build_object('ok', false, 'action', 'oversold_no_capacity', 'detail', v_cap->'overflow');
  end if;

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

  perform public.release_stock_reservations_for_order(p_order_id);

  return jsonb_build_object('ok', true, 'action', 'issued', 'ticket_count', v_count);
end;
$$;

-- -------------------------------------------------------------
-- (6) settle_mp_payment — re-creada con el GATE de cupo agregado (4b). El resto
-- intacto: lock de orden, idempotencia, contraste de monto, flip a paid, promo,
-- emisión con max_scans, release. Si el cupo se agotó (reserva expiró + revendido
-- + pago tardío) → NO emite, NO marca paid (el dinero está en MP), loguea
-- oversold_no_capacity una sola vez para reembolso manual.
-- -------------------------------------------------------------
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

  -- 4b. GATE de cupo atómico (backstop anti-oversell B2). Lockea tipos limitados
  -- y verifica sold+qty<=capacity. Si excede → NO emite ni marca paid; loguea
  -- una sola vez para reembolso manual. Ilimitados (Almighty): gate vacío → ok.
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
         public._gen_ticket_number(), v_order.buyer_name, coalesce(tt.max_scans, 1)
    from public.order_items oi
         left join public.ticket_types tt on tt.id = oi.ticket_type_id
         cross join lateral generate_series(1, oi.quantity)
   where oi.order_id = p_order_id;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'action', 'no_items');
  end if;

  perform public.release_stock_reservations_for_order(p_order_id);

  return jsonb_build_object('ok', true, 'action', 'issued',
    'ticket_count', v_count, 'expected_cents', v_order.total_cents);
end $$;

-- -------------------------------------------------------------
-- Lockdown (lección 0014): revoke EXPLÍCITO de anon Y authenticated; solo
-- service_role ejecuta (los server actions usan service_role).
-- -------------------------------------------------------------
revoke execute on function public.get_available_stock(uuid) from public, anon, authenticated;
revoke execute on function public.create_or_refresh_stock_reservation(text, uuid, integer) from public, anon, authenticated;
revoke execute on function public.reserve_order_stock(uuid, text) from public, anon, authenticated;
revoke execute on function public._order_capacity_overflow(uuid) from public, anon, authenticated;
revoke execute on function public.issue_tickets_atomic(uuid) from public, anon, authenticated;
revoke execute on function public.settle_mp_payment(uuid, uuid, text, text, integer) from public, anon, authenticated;

grant execute on function public.get_available_stock(uuid) to service_role;
grant execute on function public.create_or_refresh_stock_reservation(text, uuid, integer) to service_role;
grant execute on function public.reserve_order_stock(uuid, text) to service_role;
grant execute on function public._order_capacity_overflow(uuid) to service_role;
grant execute on function public.issue_tickets_atomic(uuid) to service_role;
grant execute on function public.settle_mp_payment(uuid, uuid, text, text, integer) to service_role;

notify pgrst, 'reload schema';
