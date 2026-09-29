-- 0075 — Evento privado (Paul, 2026-09-28): cumpleaños, reuniones y
-- celebraciones. S/ 50 (US$ 19), un evento, HASTA 200 ENTRADAS. La marca de
-- siempre sigue igual (S/ 150, ilimitadas).
--
-- Modelo:
--   - brands.tipo: 'marca' (todas las existentes) | 'privado'. Lo escribe SOLO
--     el servidor (pagarAlta, con service role). El precio lo elige el
--     servidor según este tipo: si el organizador pudiera cambiarlo, pagaría
--     S/ 50 y se pasaría a 'marca'.
--   - events.tope_entradas: se fija AL CREAR el evento a partir del tipo de
--     la marca (200 si es privado, NULL si no) y nadie lo cambia desde el
--     navegador. Queda en el evento: si algún día una marca privada pasa a
--     'marca', sus eventos viejos conservan el tope.
--   - El tope se aplica con el MISMO candado de la prueba gratis (0069):
--     check_prueba_capacidad bloquea la fila del evento (dos guardados a la
--     vez se serializan) y suma la capacidad de TODOS sus tipos (cortesías y
--     privadas incluidas); ninguno puede ser ilimitado. Se extiende acá en
--     vez de copiarlo: dos copias se desincronizan.
--
-- Guardas (NO security definer, a propósito: current_user es el rol de la
-- request; lección de 0069): anon/authenticated no pueden tocar brands.tipo
-- ni events.tope_entradas.
--
-- Lectura: brands expone columnas una por una a authenticated (0023/0043/
-- 0052/0073/0074): sin el grant, getSessionUser se cae para todos.

-- ---------- 1) brands.tipo ----------
alter table public.brands add column if not exists tipo text not null default 'marca';
alter table public.brands drop constraint if exists brands_tipo_check;
alter table public.brands add constraint brands_tipo_check check (tipo in ('marca', 'privado'));
grant select (tipo) on public.brands to authenticated;

create or replace function public.guard_brand_tipo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.tipo is distinct from (case when tg_op = 'INSERT' then 'marca' else old.tipo end) then
    raise exception 'TIPO_READONLY' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists brands_guard_tipo on public.brands;
create trigger brands_guard_tipo
  before insert or update of tipo on public.brands
  for each row execute function public.guard_brand_tipo();

-- ---------- 2) events.tope_entradas ----------
create or replace function public.privado_tope_entradas()
returns integer
language sql
immutable
as $$ select 200 $$;

alter table public.events add column if not exists tope_entradas integer;
alter table public.events drop constraint if exists events_tope_entradas_check;
alter table public.events add constraint events_tope_entradas_check check (tope_entradas is null or tope_entradas > 0);

-- Al INSERTAR, o si el evento cambia de marca: el tope sale del tipo de la
-- marca (nueva), ignorando lo que venga en la fila (nadie lo elige). Mover un
-- evento de una marca normal a una privada (hoy solo lo podría el super
-- admin) le pone el tope y falla si ya tiene más entradas o una ilimitada:
-- el candado de ticket_types no corre porque sus filas no cambian (security
-- review 2026-09-28, M1). Al ACTUALIZAR el tope a mano: desde el navegador no.
create or replace function public.events_tope_entradas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_total bigint;
  v_ilimitado boolean;
begin
  if tg_op = 'INSERT' or new.brand_id is distinct from old.brand_id then
    select case when b.tipo = 'privado' then public.privado_tope_entradas() end
      into new.tope_entradas
      from public.brands b where b.id = new.brand_id;
    if tg_op = 'UPDATE' and new.tope_entradas is not null then
      select coalesce(sum(capacity), 0), coalesce(bool_or(is_unlimited), false)
        into v_total, v_ilimitado
        from public.ticket_types where event_id = new.id;
      if v_ilimitado then raise exception 'TOPE_SIN_ILIMITADO' using errcode = 'P0001'; end if;
      if v_total > new.tope_entradas then raise exception 'TOPE_ENTRADAS' using errcode = 'P0001'; end if;
    end if;
  elsif current_user in ('anon', 'authenticated')
        and new.tope_entradas is distinct from old.tope_entradas then
    raise exception 'TOPE_READONLY' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists events_tope_entradas on public.events;
create trigger events_tope_entradas
  before insert or update of tope_entradas, brand_id on public.events
  for each row execute function public.events_tope_entradas();

-- ---------- 3) El tope, con el candado de la prueba gratis ----------
-- Misma firma y mismo trigger (ticket_types_prueba_tope, after insert o
-- update de capacity/is_unlimited/event_id): create or replace conserva los
-- permisos de 0069 (service role solamente).
create or replace function public.check_prueba_capacidad(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prueba boolean;
  v_tope integer;
  v_total bigint;
  v_ilimitado boolean;
begin
  -- Lock del evento: dos cambios de capacidad simultáneos se serializan acá
  -- (si no, cada uno vería la suma vieja y los dos pasarían).
  select es_prueba, tope_entradas into v_prueba, v_tope
    from public.events
   where id = p_event_id and (es_prueba or tope_entradas is not null)
     for update;
  if not found then return; end if;

  select coalesce(sum(capacity), 0), coalesce(bool_or(is_unlimited), false)
    into v_total, v_ilimitado
    from public.ticket_types where event_id = p_event_id;

  if v_prueba then
    if v_ilimitado then raise exception 'PRUEBA_SIN_ILIMITADO' using errcode = 'P0001'; end if;
    if v_total > public.prueba_tope_entradas() then raise exception 'PRUEBA_TOPE_ENTRADAS' using errcode = 'P0001'; end if;
  end if;
  if v_tope is not null then
    if v_ilimitado then raise exception 'TOPE_SIN_ILIMITADO' using errcode = 'P0001'; end if;
    if v_total > v_tope then raise exception 'TOPE_ENTRADAS' using errcode = 'P0001'; end if;
  end if;
end;
$$;

-- Service role solamente (lección 0014: revoke explícito de anon Y
-- authenticated; `revoke from public` no alcanza). Las guardas de trigger no
-- se llaman directo, pero se cierran igual.
revoke execute on function public.check_prueba_capacidad(uuid) from public, anon, authenticated;
grant execute on function public.check_prueba_capacidad(uuid) to service_role;
revoke execute on function public.guard_brand_tipo() from public, anon, authenticated;
revoke execute on function public.events_tope_entradas() from public, anon, authenticated;
