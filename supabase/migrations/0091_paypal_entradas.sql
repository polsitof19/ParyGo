-- 0091 — PayPal para las entradas (plan y decisiones en AGENTS.md, 2026-10-03).
--
-- La marca pega el Client ID + Secret de SU app de PayPal y cobra en USD, EUR o
-- MXN; la plata va directo a su cuenta. La plata recién se mueve cuando el
-- SERVER captura (intent CAPTURE), y captura solo si puede_cobrar_paypal dice
-- que hay cupo y que la orden sigue atada a las MISMAS credenciales. Una
-- captura que no termina en entradas se devuelve sola (refund_paypal_order
-- registra la devolución).
--
-- Todas las RPCs son service-role-only (lección 0014: revoke literal). Las
-- columnas nuevas de brands NO se exponen a anon/authenticated (0023/0043:
-- brands se expone columna por columna; estas no se agregan).

alter table public.brands
  add column if not exists paypal_client_id text,
  add column if not exists paypal_secret_enc bytea,
  add column if not exists paypal_webhook_id text,
  add column if not exists paypal_sandbox boolean not null default false,
  add column if not exists paypal_conectado_at timestamptz;

-- Una app de PayPal = una marca.
create unique index if not exists brands_paypal_client_id_key
  on public.brands (paypal_client_id) where paypal_client_id is not null;

-- Sandbox solo en marcas de prueba (lo usa el E2E): una marca real con
-- credenciales sandbox "cobraría" sin que se mueva plata.
alter table public.brands
  add constraint brands_paypal_sandbox_check check (not paypal_sandbox or is_test);

alter table public.orders
  add column if not exists paypal_order_id text,
  add column if not exists paypal_client_id text,
  add column if not exists paypal_capture_id text;

create unique index if not exists orders_paypal_order_id_key
  on public.orders (paypal_order_id) where paypal_order_id is not null;
create unique index if not exists orders_paypal_capture_id_key
  on public.orders (paypal_capture_id) where paypal_capture_id is not null;

-- Una orden de PayPal cobrada (o devuelta) siempre tiene su captura: es
-- reconciliable. Igual que la regla de MP (0055).
alter table public.orders drop constraint if exists orders_check;
alter table public.orders add constraint orders_check check (
  payment_method = 'yape_manual'::payment_method
  or payment_method = 'courtesy'::payment_method
  or (
    payment_method = 'mercadopago'::payment_method
    and (
      mp_preference_id is not null
      or (status not in ('paid'::order_status, 'refunded'::order_status)
          and mp_payment_id is null)
    )
  )
  or (
    payment_method = 'paypal'::payment_method
    and (paypal_capture_id is not null
         or status not in ('paid'::order_status, 'refunded'::order_status))
  )
);

-- ---------------------------------------------------------------------------
-- Conectar / cambiar. Bajo FOR UPDATE de la marca: un pago PayPal activo
-- (orden de PayPal creada hace < 30 min y sin cobrar) con OTRAS credenciales
-- bloquea el cambio. La carrera que queda la cierra puede_cobrar_paypal (la
-- orden se captura solo con el client_id con que se creó).
create or replace function public.set_brand_paypal(
  p_brand_id uuid, p_client_id text, p_secret text, p_webhook_id text,
  p_sandbox boolean, p_encryption_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if nullif(btrim(p_client_id), '') is null or nullif(p_secret, '') is null
     or nullif(p_encryption_key, '') is null then
    return jsonb_build_object('ok', false, 'action', 'datos_incompletos');
  end if;
  perform 1 from public.brands where id = p_brand_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'action', 'marca_no_existe');
  end if;
  if exists (select 1 from public.brands where paypal_client_id = p_client_id and id <> p_brand_id) then
    return jsonb_build_object('ok', false, 'action', 'cuenta_en_otra_marca');
  end if;
  if exists (
    select 1 from public.orders
     where brand_id = p_brand_id and payment_method = 'paypal'
       and status = 'pending_payment' and paypal_order_id is not null
       and paypal_client_id is distinct from p_client_id
       and created_at > now() - interval '30 minutes'
  ) then
    return jsonb_build_object('ok', false, 'action', 'pago_activo');
  end if;
  update public.brands set
    paypal_client_id    = p_client_id,
    paypal_secret_enc   = extensions.pgp_sym_encrypt(p_secret, p_encryption_key),
    paypal_webhook_id   = p_webhook_id,
    paypal_sandbox      = coalesce(p_sandbox, false),
    paypal_conectado_at = now()
  where id = p_brand_id;
  return jsonb_build_object('ok', true, 'action', 'conectada');
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'action', 'cuenta_en_otra_marca');
  when check_violation then
    return jsonb_build_object('ok', false, 'action', 'sandbox_solo_prueba');
end;
$function$;

create or replace function public.clear_brand_paypal(p_brand_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform 1 from public.brands where id = p_brand_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'action', 'marca_no_existe');
  end if;
  if exists (
    select 1 from public.orders
     where brand_id = p_brand_id and payment_method = 'paypal'
       and status = 'pending_payment' and paypal_order_id is not null
       and created_at > now() - interval '30 minutes'
  ) then
    return jsonb_build_object('ok', false, 'action', 'pago_activo');
  end if;
  update public.brands set
    paypal_client_id = null, paypal_secret_enc = null, paypal_webhook_id = null,
    paypal_sandbox = false, paypal_conectado_at = null
  where id = p_brand_id;
  return jsonb_build_object('ok', true, 'action', 'desconectada');
end;
$function$;

create or replace function public.get_brand_paypal_credentials(p_brand_id uuid, p_encryption_key text)
returns table (client_id text, secret text, webhook_id text, sandbox boolean, moneda text)
language sql
security definer
set search_path to 'public'
as $function$
  select b.paypal_client_id,
         extensions.pgp_sym_decrypt(b.paypal_secret_enc, p_encryption_key)::text,
         b.paypal_webhook_id, b.paypal_sandbox, b.moneda
    from public.brands b
   where b.id = p_brand_id and b.paypal_client_id is not null and b.paypal_secret_enc is not null;
$function$;

-- ---------------------------------------------------------------------------
-- ¿Se puede capturar? Se llama JUSTO antes de capturar. Si dice que no, no se
-- captura y PayPal no mueve plata.
create or replace function public.puede_cobrar_paypal(
  p_order_id uuid, p_brand_id uuid, p_paypal_order_id text, p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_cap jsonb;
begin
  select * into v_order from public.orders
   where id = p_order_id and brand_id = p_brand_id
   for update;
  if not found or v_order.payment_method <> 'paypal' then
    return jsonb_build_object('ok', false, 'action', 'order_not_found');
  end if;
  if v_order.status = 'paid' then
    return jsonb_build_object('ok', false, 'action', 'ya_pagada');
  end if;
  if v_order.status not in ('pending_payment', 'expired') then
    return jsonb_build_object('ok', false, 'action', 'not_settleable', 'status', v_order.status::text);
  end if;
  if v_order.paypal_order_id is distinct from p_paypal_order_id then
    return jsonb_build_object('ok', false, 'action', 'otra_orden_paypal');
  end if;
  -- La orden se cobra con las credenciales con que se creó, y la marca tiene
  -- que seguir con esas mismas.
  if v_order.paypal_client_id is distinct from p_client_id
     or not exists (select 1 from public.brands where id = p_brand_id and paypal_client_id = p_client_id) then
    return jsonb_build_object('ok', false, 'action', 'credenciales_cambiaron');
  end if;
  v_cap := public._order_capacity_overflow(p_order_id);
  if (v_cap->>'ok')::boolean is false then
    return jsonb_build_object('ok', false, 'action', 'sin_cupo', 'detail', v_cap->'overflow');
  end if;
  return jsonb_build_object('ok', true, 'action', 'cobrar', 'total_cents', v_order.total_cents);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Liquidar una captura COMPLETED (vuelta del comprador o webhook). Mismo
-- esqueleto que settle_mp_payment (0084) + la moneda de la marca.
create or replace function public.settle_paypal_payment(
  p_order_id uuid, p_brand_id uuid, p_capture_id text, p_paid_cents integer, p_currency text)
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
  v_moneda text;
begin
  select * into v_order from public.orders
   where id = p_order_id and brand_id = p_brand_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'action', 'order_not_found');
  end if;
  if v_order.payment_method <> 'paypal' then
    return jsonb_build_object('ok', false, 'action', 'not_paypal');
  end if;
  if nullif(btrim(p_capture_id), '') is null then
    return jsonb_build_object('ok', false, 'action', 'sin_captura');
  end if;

  -- Devuelta: nunca vuelve a 'paid'.
  if v_order.status = 'refunded' then
    return jsonb_build_object('ok', false, 'action', 'refunded');
  end if;

  -- Idempotencia bajo el lock.
  select count(*) into v_existing from public.tickets where order_id = p_order_id;
  if v_existing > 0 then
    if v_order.paypal_capture_id is not null and p_capture_id is distinct from v_order.paypal_capture_id then
      insert into public.events_log (brand_id, event_id, order_id, type, payload)
      select v_order.brand_id, v_order.event_id, p_order_id, 'paypal_duplicate_capture',
             jsonb_build_object('capture_id', p_capture_id, 'paid_cents', p_paid_cents, 'first_capture_id', v_order.paypal_capture_id)
       where not exists (select 1 from public.events_log
                          where order_id = p_order_id and type = 'paypal_duplicate_capture'
                            and payload->>'capture_id' = p_capture_id);
      return jsonb_build_object('ok', false, 'action', 'duplicate_capture');
    end if;
    if v_order.status <> 'paid' then
      update public.orders
         set status = 'paid', paid_at = coalesce(paid_at, now()),
             paypal_capture_id = coalesce(paypal_capture_id, p_capture_id)
       where id = p_order_id;
    end if;
    return jsonb_build_object('ok', true, 'action', 'already_issued', 'ticket_count', v_existing);
  end if;

  if v_order.status not in ('pending_payment', 'paid', 'failed', 'expired') then
    return jsonb_build_object('ok', false, 'action', 'not_settleable', 'status', v_order.status::text);
  end if;
  if exists (select 1 from public.orders where paypal_capture_id = p_capture_id and id <> p_order_id) then
    return jsonb_build_object('ok', false, 'action', 'capture_de_otra_orden');
  end if;

  -- Moneda y monto contra lo congelado / la marca (nunca contra el aviso).
  select moneda into v_moneda from public.brands where id = p_brand_id;
  if p_currency is distinct from v_moneda then
    return jsonb_build_object('ok', false, 'action', 'currency_mismatch',
      'expected', v_moneda, 'paid', p_currency);
  end if;
  if p_paid_cents is distinct from v_order.total_cents then
    return jsonb_build_object('ok', false, 'action', 'amount_mismatch',
      'expected_cents', v_order.total_cents, 'paid_cents', p_paid_cents);
  end if;

  v_cap := public._order_capacity_overflow(p_order_id);
  if (v_cap->>'ok')::boolean is false then
    if not exists (select 1 from public.events_log
                    where order_id = p_order_id and type = 'oversold_no_capacity') then
      insert into public.events_log (brand_id, event_id, order_id, type, payload)
      values (v_order.brand_id, v_order.event_id, p_order_id, 'oversold_no_capacity',
              jsonb_build_object('flow', 'paypal', 'capture_id', p_capture_id, 'detail', v_cap->'overflow'));
    end if;
    return jsonb_build_object('ok', false, 'action', 'oversold_no_capacity', 'detail', v_cap->'overflow');
  end if;

  update public.orders
     set status = 'paid', paid_at = coalesce(paid_at, now()), paypal_capture_id = p_capture_id
   where id = p_order_id;

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
    -- Sin ítems no hay nada que emitir: se deshace el flip (nunca paid sin entradas).
    raise exception 'PAYPAL_SIN_ITEMS' using errcode = 'P0001';
  end if;

  perform public.release_stock_reservations_for_order(p_order_id);

  return jsonb_build_object('ok', true, 'action', 'issued',
    'ticket_count', v_count, 'expected_cents', v_order.total_cents);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Devolución. Dos casos:
--  · orden cobrada (paid/refunded): solo si la captura devuelta es LA que la
--    liquidó → refunded + entradas ANULADAS (como refund_mp_order, 0084).
--  · captura que NO terminó en entradas (devolución automática del server o
--    aviso de PayPal de esa captura): la orden queda refunded con la captura
--    anotada, sin entradas, cupo y promo liberados.
-- p_motivo: 'refunded' | 'reversed' | 'auto' (queda en la bitácora).
create or replace function public.refund_paypal_order(
  p_order_id uuid, p_brand_id uuid, p_capture_id text, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_anuladas int := 0;
  v_tickets int;
begin
  select * into v_order from public.orders
   where id = p_order_id and brand_id = p_brand_id
   for update;
  if not found or v_order.payment_method <> 'paypal' then
    return jsonb_build_object('ok', false, 'action', 'order_not_found');
  end if;
  if nullif(btrim(p_capture_id), '') is null then
    return jsonb_build_object('ok', false, 'action', 'sin_captura');
  end if;

  select count(*) into v_tickets from public.tickets where order_id = p_order_id;

  if v_order.status in ('paid', 'refunded') and (v_tickets > 0 or v_order.paypal_capture_id is not null) then
    if p_capture_id is distinct from v_order.paypal_capture_id then
      insert into public.events_log (brand_id, event_id, order_id, type, payload)
      values (v_order.brand_id, v_order.event_id, p_order_id, 'paypal_refund_other_capture',
              jsonb_build_object('capture_id', p_capture_id, 'order_capture_id', v_order.paypal_capture_id, 'motivo', p_motivo));
      return jsonb_build_object('ok', false, 'action', 'capture_mismatch');
    end if;
    if v_order.status = 'paid' then
      update public.orders set status = 'refunded' where id = p_order_id;
    end if;
    update public.tickets set invalidated_at = now()
     where order_id = p_order_id and invalidated_at is null;
    get diagnostics v_anuladas = row_count;
    if v_anuladas > 0 or v_order.status = 'paid' then
      insert into public.events_log (brand_id, event_id, order_id, type, payload)
      values (v_order.brand_id, v_order.event_id, p_order_id, 'paypal_refund_tickets_voided',
              jsonb_build_object('capture_id', p_capture_id, 'motivo', p_motivo, 'tickets_anuladas', v_anuladas));
    end if;
    return jsonb_build_object('ok', true, 'action', 'refunded', 'tickets_anuladas', v_anuladas);
  end if;

  -- Captura sin entradas: la orden no se había emitido.
  if v_tickets = 0 and v_order.status in ('pending_payment', 'failed', 'expired') then
    if exists (select 1 from public.orders where paypal_capture_id = p_capture_id and id <> p_order_id) then
      return jsonb_build_object('ok', false, 'action', 'capture_de_otra_orden');
    end if;
    update public.orders set status = 'refunded', paypal_capture_id = p_capture_id where id = p_order_id;
    perform public.release_stock_reservations_for_order(p_order_id);
    perform public.release_promo_redemption_for_order(p_order_id);
    insert into public.events_log (brand_id, event_id, order_id, type, payload)
    values (v_order.brand_id, v_order.event_id, p_order_id, 'paypal_auto_refund',
            jsonb_build_object('capture_id', p_capture_id, 'motivo', p_motivo));
    return jsonb_build_object('ok', true, 'action', 'refunded_sin_entradas');
  end if;

  return jsonb_build_object('ok', false, 'action', 'not_refundable', 'status', v_order.status::text);
end;
$function$;

revoke execute on function public.set_brand_paypal(uuid, text, text, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.clear_brand_paypal(uuid) from public, anon, authenticated;
revoke execute on function public.get_brand_paypal_credentials(uuid, text) from public, anon, authenticated;
revoke execute on function public.puede_cobrar_paypal(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.settle_paypal_payment(uuid, uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function public.refund_paypal_order(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_brand_paypal(uuid, text, text, text, boolean, text) to service_role;
grant execute on function public.clear_brand_paypal(uuid) to service_role;
grant execute on function public.get_brand_paypal_credentials(uuid, text) to service_role;
grant execute on function public.puede_cobrar_paypal(uuid, uuid, text, text) to service_role;
grant execute on function public.settle_paypal_payment(uuid, uuid, text, integer, text) to service_role;
grant execute on function public.refund_paypal_order(uuid, uuid, text, text) to service_role;
