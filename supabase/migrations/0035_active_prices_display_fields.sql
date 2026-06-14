-- =============================================================
-- 0035 — get_event_active_prices: campos de DISPLAY de fases (buyer-facing).
-- =============================================================
-- Agrega columnas ADITIVAS para que la página pública muestre el countdown de la
-- fase activa y el teaser de la siguiente:
--   · active_name     — nombre de la fase activa (p.ej. "Preventa 1")
--   · active_ends_at  — fin de la fase activa (target de la cuenta regresiva)
--   · next_name       — nombre de la fase siguiente
-- NO cambia active_price_cents ni la lógica de resolución de precio (precio
-- congelado intacto): solo agrega datos de presentación. Como cambia el RETURNS
-- TABLE, va con DROP + CREATE (atómico dentro de la transacción de la migración).
-- Sigue SECURITY DEFINER + gateada a eventos publicados (0009) + callable por el
-- público (la página de compra anónima la usa para mostrar precios/fechas).
-- =============================================================

drop function if exists public.get_event_active_prices(uuid);

create function public.get_event_active_prices(p_event_id uuid)
returns table (
  ticket_type_id     uuid,
  active_price_cents integer,
  active_name        text,
  active_ends_at     timestamptz,
  next_price_cents   integer,
  next_starts_at     timestamptz,
  next_name          text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tt.id,
    coalesce(act.price_cents, tt.price_cents) as active_price_cents,
    act.name     as active_name,
    act.ends_at  as active_ends_at,
    nx.price_cents as next_price_cents,
    nx.starts_at   as next_starts_at,
    nx.name        as next_name
  from public.ticket_types tt
  join public.events e on e.id = tt.event_id and e.is_published = true
  left join lateral (
    select p.price_cents, p.name, p.ends_at
    from public.ticket_type_price_phases p
    where p.ticket_type_id = tt.id
      and (p.starts_at is null or now() >= p.starts_at)
      and (p.ends_at   is null or now() <  p.ends_at)
    order by p.starts_at desc nulls last, p.sort_order desc
    limit 1
  ) act on true
  left join lateral (
    select p.price_cents, p.starts_at, p.name
    from public.ticket_type_price_phases p
    where p.ticket_type_id = tt.id
      and p.starts_at is not null
      and p.starts_at > now()
    order by p.starts_at asc, p.sort_order asc
    limit 1
  ) nx on true
  where tt.event_id = p_event_id;
$$;

-- Precios/fechas de fase son públicos (la página de compra anónima los muestra).
-- Mantener el acceso público que tenía la versión anterior (default PUBLIC execute
-- tras CREATE); reaseverar explícito para que quede documentado.
grant execute on function public.get_event_active_prices(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
