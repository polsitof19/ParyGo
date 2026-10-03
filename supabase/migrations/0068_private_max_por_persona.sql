-- =============================================================
-- 0068 — Entrada privada: el ORGANIZADOR decide cuántas por persona
-- =============================================================
-- Pedido de Paul (2026-09-23): "que en la entrada se pueda poner cuántos se
-- puede reclamar, así los organizadores tienen el control". La 0067 lo fijó
-- en 1 para las privadas a S/0; ahora es un número por entrada privada:
--   ticket_type_access.max_por_persona  NULL = sin límite; N = hasta N por
--   persona (email y documento por separado, igual que la 0060).
-- Default al hacerla privada (lo pone la app): 1 si es gratis, sin límite si
-- es paga. Las filas existentes (solo E2E) quedan con 1 si su tipo es S/0.
-- El gate sigue en reserve_order_stock, con los mismos advisory locks por
-- (tipo, email) y (tipo, documento); el resto de la función es la de la 0067.
-- Idempotente.
-- =============================================================

alter table public.ticket_type_access
  add column if not exists max_por_persona int;

do $$ begin
  alter table public.ticket_type_access
    add constraint ticket_type_access_max_por_persona_rango
    check (max_por_persona is null or max_por_persona between 1 and 100);
exception when duplicate_object then null; end $$;

update public.ticket_type_access ta set max_por_persona = 1
from public.ticket_types t
where t.id = ta.ticket_type_id and t.price_cents = 0 and ta.max_por_persona is null;

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
  v_metodo text;
  v_limit int;
  v_qty int;
  v_taken int;
  v_priv record;
begin
  if p_session_id is null or length(p_session_id) < 8 then
    raise exception 'invalid session_id';
  end if;

  -- ---------------------------------------------------------------
  -- GATE POR PERSONA (0060, corregido en la 0061). Va PRIMERO: si la persona
  -- ya llegó a su límite, no tiene sentido tomarle cupo a nadie.
  -- NO aplica a las cortesías que emite el organizador desde su panel.
  -- ---------------------------------------------------------------
  select o.event_id, o.buyer_email, upper(nullif(btrim(o.buyer_dni), '')), o.payment_method
    into v_event_id, v_email, v_dni, v_metodo
  from public.orders o
  where o.id = p_order_id;

  if v_event_id is null then
    raise exception 'order_not_found';
  end if;

  select e.max_per_person into v_limit from public.events e where e.id = v_event_id;

  if v_limit is not null and v_metodo is distinct from 'courtesy' then
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

  -- ---------------------------------------------------------------
  -- GATE DE LA ENTRADA PRIVADA (0067, configurable desde la 0068): una entrada
  -- privada (con link, 0066) vale hasta max_por_persona por persona. Misma idea y mismo tipo
  -- de lock que el gate de arriba, pero por (tipo, email) y (tipo, documento):
  -- el segundo reclamo de la misma persona espera al primero y lo ve.
  -- NULL = sin límite (default de las pagas: un promotor vende a un grupo).
  -- ---------------------------------------------------------------
  if v_metodo is distinct from 'courtesy' then
    for v_priv in
      select oi.ticket_type_id as ttid, sum(oi.quantity)::int as qty, ta.max_por_persona as lim
      from public.order_items oi
      join public.ticket_type_access ta on ta.ticket_type_id = oi.ticket_type_id
      where oi.order_id = p_order_id and ta.max_por_persona is not null
      group by oi.ticket_type_id, ta.max_por_persona
      order by oi.ticket_type_id
    loop
      perform pg_advisory_xact_lock(hashtextextended(v_priv.ttid::text || '|pe|' || lower(v_email::text), 0));
      if v_dni is not null then
        perform pg_advisory_xact_lock(hashtextextended(v_priv.ttid::text || '|pd|' || v_dni, 0));
      end if;
      select coalesce(sum(oi.quantity), 0)::int into v_taken
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where oi.ticket_type_id = v_priv.ttid
        and o.id <> p_order_id
        and o.payment_method is distinct from 'courtesy'
        and (lower(o.buyer_email) = lower(v_email::text)
             or (v_dni is not null and upper(nullif(btrim(o.buyer_dni), '')) = v_dni))
        and (o.status = 'paid'
             or (o.status in ('pending_yape_review', 'pending_payment')
                 and exists (select 1 from public.stock_reservations sr
                             where sr.order_id = o.id and sr.expires_at > now())));
      if v_taken + v_priv.qty > v_priv.lim then
        raise exception 'private_claim_limit: type=% limit=% taken=% requested=%', v_priv.ttid, v_priv.lim, v_taken, v_priv.qty;
      end if;
    end loop;
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

revoke all on function public.reserve_order_stock(uuid, text) from public;
revoke all on function public.reserve_order_stock(uuid, text) from anon;
revoke all on function public.reserve_order_stock(uuid, text) from authenticated;

