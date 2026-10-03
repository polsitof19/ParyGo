-- 0088 — Vender fuera de Perú (plan en AGENTS.md, 2026-10-03).
--
-- brands.moneda: la moneda en que la marca vende sus entradas. Los precios
--   siguen siendo enteros ×100 de ESA moneda (también CLP/COP): no cambia ningún
--   cálculo, solo cómo se muestra. NO cambia una vez que la marca tiene un
--   evento (sus precios, fases y cupones fijos ya están escritos en la moneda de
--   entonces). Code, Hoesky y demotest quedan en PEN por default.
-- brands.zona_horaria: la hora en que se leen y escriben las fechas de la marca.
-- brands.metodo_manual: el medio manual con comprobante. Reusa yape_number
--   (cuenta), yape_holder (titular o red) y yape_qr_url; payment_method =
--   'yape_manual' pasa a significar "pago manual con comprobante" para todos.
--
-- Defaults = lo de hoy (PEN, Lima, yape): todas las filas actuales son válidas y
-- la app desplegada no se entera (two-phase).

alter table public.brands
  add column if not exists moneda text not null default 'PEN',
  add column if not exists zona_horaria text not null default 'America/Lima',
  add column if not exists metodo_manual text not null default 'yape';

alter table public.brands
  add constraint brands_moneda_check
    check (moneda in ('PEN','USD','COP','MXN','CLP','ARS','EUR')),
  add constraint brands_zona_horaria_check
    check (zona_horaria in ('America/Lima','America/Bogota','America/Mexico_City',
      'America/Santiago','America/Argentina/Buenos_Aires','America/Guayaquil',
      'Europe/Madrid','America/New_York')),
  add constraint brands_metodo_manual_check
    check (metodo_manual in ('yape','nequi','bizum','zelle','usdt','transferencia')),
  -- El medio tiene que servir para la moneda (yape solo soles, etc.).
  add constraint brands_metodo_moneda_check
    check (case metodo_manual
             when 'yape'  then moneda = 'PEN'
             when 'nequi' then moneda = 'COP'
             when 'bizum' then moneda = 'EUR'
             when 'zelle' then moneda = 'USD'
             when 'usdt'  then moneda = 'USD'
             else true end);

-- La moneda no cambia si la marca ya tiene un evento.
create or replace function public.guard_brand_moneda()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.moneda is distinct from old.moneda
     and exists (select 1 from public.events where brand_id = new.id) then
    raise exception 'MONEDA_CON_EVENTOS' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_brand_moneda on public.brands;
create trigger guard_brand_moneda
  before update of moneda on public.brands
  for each row execute function public.guard_brand_moneda();

-- Carrera: un evento nuevo (o movido de marca) y un cambio de moneda a la vez.
-- FOR SHARE sobre la fila de la marca los serializa: si el cambio gana, el
-- evento se crea con la moneda nueva; si el evento gana, el cambio ve el evento
-- y se rechaza.
create or replace function public.lock_brand_para_evento()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  perform 1 from public.brands where id = new.brand_id for share;
  return new;
end;
$function$;

drop trigger if exists lock_brand_para_evento on public.events;
create trigger lock_brand_para_evento
  before insert or update of brand_id on public.events
  for each row execute function public.lock_brand_para_evento();

revoke execute on function public.guard_brand_moneda() from public, anon, authenticated;
revoke execute on function public.lock_brand_para_evento() from public, anon, authenticated;

-- brands expone columna por columna (0023/0043/0052/0074): el comprador necesita
-- moneda, zona y medio para mostrar su página.
grant select (moneda, zona_horaria, metodo_manual) on public.brands to anon, authenticated;
