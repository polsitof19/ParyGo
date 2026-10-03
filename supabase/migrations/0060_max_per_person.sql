-- =============================================================
-- 0060 — Límite de entradas POR PERSONA, configurable por evento.
-- =============================================================
-- Para qué: un evento GRATIS de aforo grande se lo llevan unos pocos si nada
-- lo impide. "Reclama tu entrada gratis" tiene que significar UNA persona, N
-- entradas, no un script que pide 300.
--
--   events.max_per_person  NULL = sin límite (comportamiento de siempre).
--                          N    = como máximo N entradas por persona y evento.
--
-- QUIÉN ES "UNA PERSONA": el email Y el documento, por separado. Cambiar de
-- email con el mismo DNI no da más entradas, y cambiar de DNI con el mismo
-- email tampoco. Son dos llaves independientes, las dos topadas por el mismo N.
-- (Un DNI ajeno sigue siendo posible: esto es un tope razonable, no una
-- verificación de identidad — no hay RENIEC en el producto.)
--
-- DÓNDE SE APLICA: dentro de reserve_order_stock, que es el EMBUDO ÚNICO por
-- el que pasa toda compra y todo reclamo (Yape, MercadoPago y gratis) antes de
-- que exista ninguna entrada. No en el código de la app: dos requests
-- simultáneos leerían los dos el mismo conteo y pasarían los dos.
--
-- POR QUÉ ES ATÓMICO DE VERDAD: el conteo va detrás de un
-- pg_advisory_xact_lock por (evento, email) y otro por (evento, documento).
-- El lock se suelta recién en el COMMIT, así que el segundo reclamo de la misma
-- persona espera, y cuando cuenta YA VE la reserva que dejó el primero. Sin ese
-- lock, dos toques al mismo tiempo pasan los dos: es exactamente el bug de
-- concurrencia que este proyecto ya pagó caro con el stock (0031).
--
-- QUÉ CUENTA COMO "YA TOMADAS":
--   · órdenes PAGADAS del evento (entradas ya emitidas), y
--   · órdenes pendientes que TODAVÍA retienen cupo (reserva activa, TTL 30 min).
-- Una pendiente abandonada deja de contar cuando su reserva vence, igual que
-- devuelve el cupo. Si contara para siempre, un checkout abandonado dejaría a
-- esa persona afuera del evento sin que nadie pueda arreglarlo.
--
-- QUÉ NO TOCA: las cortesías que emite el organizador desde el panel no pasan
-- por este embudo y no se ven afectadas — son una decisión suya, no un reclamo
-- del público.
--
-- Two-phase: la columna nace NULL en todos los eventos existentes, así que
-- mientras nadie la cargue el comportamiento es idéntico al de hoy.
-- =============================================================

alter table public.events
  add column if not exists max_per_person int;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_max_per_person_check' and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_max_per_person_check
      check (max_per_person is null or max_per_person between 1 and 100);
  end if;
end $$;

comment on column public.events.max_per_person is
  'Máximo de entradas por persona (email y documento, por separado) en este evento. NULL = sin límite. Lo aplica reserve_order_stock bajo advisory lock.';

-- Conteo por persona. Función auxiliar, SECURITY DEFINER, sin permisos para
-- anon/authenticated: solo la usa reserve_order_stock (service-role).
create or replace function public.tickets_taken_by_person(
  p_event_id uuid,
  p_email citext,
  p_dni text,
  p_exclude_order uuid
)
returns int
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(oi.quantity), 0)::int
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.event_id = p_event_id
    and o.id is distinct from p_exclude_order
    and (
      lower(o.buyer_email) = lower(p_email::text)
      or (p_dni is not null and nullif(btrim(o.buyer_dni), '') = p_dni)
    )
    and (
      o.status = 'paid'
      or (
        o.status in ('pending_yape_review', 'pending_payment')
        and exists (
          select 1 from public.stock_reservations sr
          where sr.order_id = o.id and sr.expires_at > now()
        )
      )
    );
$$;

revoke all on function public.tickets_taken_by_person(uuid, citext, text, uuid) from public;
revoke all on function public.tickets_taken_by_person(uuid, citext, text, uuid) from anon;
revoke all on function public.tickets_taken_by_person(uuid, citext, text, uuid) from authenticated;

-- reserve_order_stock: mismo cuerpo que la 0031 + el gate por persona ANTES de
-- tocar stock. Se deja el bloque de stock tal cual estaba (no se toca una línea
-- de la lógica de cupo), para que el cambio sea legible en la diferencia.
create or replace function public.reserve_order_stock(p_order_id uuid, p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_rec record;
  v_ttid uuid;
  v_reserved_others int;
  v_available int;
  v_expires timestamptz := now() + interval '30 minutes';
  v_event_id uuid;
  v_email citext;
  v_dni text;
  v_limit int;
  v_qty int;
  v_taken int;
begin
  if p_session_id is null or length(p_session_id) < 8 then
    raise exception 'invalid session_id';
  end if;

  -- ---------------------------------------------------------------
  -- GATE POR PERSONA (0060). Va PRIMERO: si la persona ya llegó a su
  -- límite, no tiene sentido tomarle cupo a nadie.
  -- ---------------------------------------------------------------
  select o.event_id, o.buyer_email, nullif(btrim(o.buyer_dni), '')
    into v_event_id, v_email, v_dni
  from public.orders o
  where o.id = p_order_id;

  if v_event_id is null then
    raise exception 'order_not_found';
  end if;

  select e.max_per_person into v_limit from public.events e where e.id = v_event_id;

  if v_limit is not null then
    -- Un lock por (evento, email) y otro por (evento, documento). Son de
    -- transacción: se sueltan en el commit, así que el segundo reclamo de la
    -- misma persona cuenta DESPUÉS de ver la reserva del primero.
    perform pg_advisory_xact_lock(hashtextextended(v_event_id::text || '|e|' || lower(v_email::text), 0));
    if v_dni is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_event_id::text || '|d|' || v_dni, 0));
    end if;

    select coalesce(sum(oi.quantity), 0)::int into v_qty
    from public.order_items oi where oi.order_id = p_order_id;

    v_taken := public.tickets_taken_by_person(v_event_id, v_email, v_dni, p_order_id);

    if v_taken + v_qty > v_limit then
      raise exception 'per_person_limit: limit=% taken=% requested=%', v_limit, v_taken, v_qty;
    end if;
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
$function$;

-- Mismos permisos que traía la 0031: service-role only. `revoke from public` NO
-- alcanza (Supabase concede por ALTER DEFAULT PRIVILEGES a anon/authenticated):
-- hay que revocar de los dos roles explícitamente. Bug histórico 0014.
revoke all on function public.reserve_order_stock(uuid, text) from public;
revoke all on function public.reserve_order_stock(uuid, text) from anon;
revoke all on function public.reserve_order_stock(uuid, text) from authenticated;
