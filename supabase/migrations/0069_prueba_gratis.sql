-- =============================================================
-- 0069 · Prueba gratis: 1 evento, hasta 50 entradas en total
-- =============================================================
-- Pedido de Paul (2026-09-24). Una marca NUEVA puede crear UN evento sin
-- saldo; ese evento queda marcado es_prueba y la suma de capacidades de sus
-- tipos (pagas, gratis y cortesías por igual) no pasa de 50, sin "ilimitado".
--
-- NO TOCA NADA DE LO QUE YA EXISTE:
--   - brands.prueba_disponible nace FALSE para todas (Code, Hoesky, demotest):
--     solo la tiene quien el super admin se la dé.
--   - create_brand_event, reserve_order_stock, claim_free_order,
--     issue_tickets_atomic: sin cambios. El tope se apoya en la capacidad por
--     tipo, que el anti-sobreventa (0031) ya hace cumplir con FOR UPDATE.
--   - El trigger de tope sale en la primera línea si el evento no es de
--     prueba, y solo corre al tocar capacity/is_unlimited/event_id (NO en cada
--     venta: `sold` no está en la lista de columnas).
--
-- AGUJERO QUE CIERRA: el brand_admin puede UPDATE sobre sus events por RLS
-- (events_update_brand) y la grant de tabla cubre todas las columnas; un
-- REVOKE de columna no alcanza contra una grant de tabla. Por eso un trigger
-- impide que anon/authenticated cambien es_prueba (sin él, un
-- `update events set es_prueba=false` desde el navegador quitaba el tope).
-- Idem prueba_disponible en brands (hoy solo el super escribe brands, pero la
-- regla no debe depender de esa policy).
-- =============================================================

alter table public.brands add column if not exists prueba_disponible boolean not null default false;
alter table public.events add column if not exists es_prueba boolean not null default false;

-- Tope en una constante de una sola fuente.
create or replace function public.prueba_tope_entradas()
returns int language sql immutable as $$ select 50 $$;

-- ---------- 1) es_prueba / prueba_disponible: solo el servidor ----------
create or replace function public.guard_prueba_flags()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- NO es security definer a propósito: current_user es el rol de la request
  -- (anon/authenticated desde PostgREST, service_role desde el server).
  if current_user in ('anon', 'authenticated') then
    if tg_table_name = 'events' and new.es_prueba is distinct from (case when tg_op = 'INSERT' then false else old.es_prueba end) then
      raise exception 'PRUEBA_FLAG_READONLY' using errcode = '42501';
    end if;
    if tg_table_name = 'brands' and new.prueba_disponible is distinct from (case when tg_op = 'INSERT' then false else old.prueba_disponible end) then
      raise exception 'PRUEBA_FLAG_READONLY' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists events_guard_prueba on public.events;
create trigger events_guard_prueba
  before insert or update of es_prueba on public.events
  for each row execute function public.guard_prueba_flags();

drop trigger if exists brands_guard_prueba on public.brands;
create trigger brands_guard_prueba
  before insert or update of prueba_disponible on public.brands
  for each row execute function public.guard_prueba_flags();

-- ---------- 2) Tope de 50 en eventos de prueba ----------
create or replace function public.check_prueba_capacidad(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_ilimitado boolean;
begin
  -- Lock del evento: dos cambios de capacidad simultáneos se serializan acá
  -- (si no, cada uno vería la suma vieja y los dos pasarían).
  perform 1 from public.events where id = p_event_id and es_prueba for update;
  if not found then return; end if;

  select coalesce(sum(capacity), 0), coalesce(bool_or(is_unlimited), false)
    into v_total, v_ilimitado
    from public.ticket_types where event_id = p_event_id;

  if v_ilimitado then
    raise exception 'PRUEBA_SIN_ILIMITADO' using errcode = 'P0001';
  end if;
  if v_total > public.prueba_tope_entradas() then
    raise exception 'PRUEBA_TOPE_ENTRADAS' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.tt_check_prueba()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_prueba_capacidad(new.event_id);
  return null;
end;
$$;

drop trigger if exists ticket_types_prueba_tope on public.ticket_types;
create trigger ticket_types_prueba_tope
  after insert or update of capacity, is_unlimited, event_id on public.ticket_types
  for each row execute function public.tt_check_prueba();

-- ---------- 3) Crear el evento de prueba ----------
-- Envoltorio de create_brand_event (NO una copia: dos copias se desincronizan).
-- En UNA transacción: gasta la prueba (lock de la fila de brands → dos
-- pestañas a la vez = 1 evento, 1 rechazo), presta 1 de saldo que
-- create_brand_event consume enseguida, marca el evento y valida el tope.
-- Cualquier fallo revierte todo: ni prueba gastada, ni evento, ni saldo.
create or replace function public.create_brand_trial_event(
  p_brand_id      uuid,
  p_actor_user_id uuid,
  p_event         jsonb,
  p_ticket_types  jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
  v_event_id uuid;
begin
  update public.brands
     set prueba_disponible = false,
         event_balance = event_balance + 1
   where id = p_brand_id
     and prueba_disponible
  returning true into v_ok;
  if v_ok is null then
    raise exception 'NO_TRIAL' using errcode = 'P0001';
  end if;

  v_event_id := public.create_brand_event(p_brand_id, p_actor_user_id, p_event, p_ticket_types);

  update public.events set es_prueba = true where id = v_event_id;
  perform public.check_prueba_capacidad(v_event_id);

  insert into public.events_log (brand_id, event_id, actor_user_id, type, payload)
  values (p_brand_id, v_event_id, p_actor_user_id, 'trial_used',
          jsonb_build_object('tope_entradas', public.prueba_tope_entradas()));
  return v_event_id;
end;
$$;

-- Service role only. `revoke from public` NO basta (default privileges de
-- Supabase conceden a anon/authenticated): revoke explícito. Lección 0014.
revoke execute on function public.create_brand_trial_event(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_brand_trial_event(uuid, uuid, jsonb, jsonb) to service_role;
revoke execute on function public.check_prueba_capacidad(uuid) from public, anon, authenticated;
grant execute on function public.check_prueba_capacidad(uuid) to service_role;
revoke execute on function public.tt_check_prueba() from public, anon, authenticated;
revoke execute on function public.guard_prueba_flags() from public, anon, authenticated;
