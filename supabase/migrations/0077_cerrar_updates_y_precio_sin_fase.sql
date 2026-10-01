-- 0077 — Dos cierres de la auditoría de dinero (2026-09-30).
-- =============================================================
-- 1) Nadie con JWT escribe directo en orders / tickets / yape_proofs.
--    authenticated tenía UPDATE por RLS: el dueño podía poner su orden en
--    'paid' o cambiar total_cents por PostgREST, y el PERSONAL DE PUERTA
--    (validator) podía tocar tickets (scan_count, invalidated_at, max_scans):
--    re-habilitar un QR usado o anulado sin pasar por validate_ticket.
--    Toda escritura de la app va por service role (verificado: ningún
--    createClient de sesión escribe en estas tablas) y el escaneo va por
--    validate_ticket (SECURITY DEFINER), así que no se rompe nada.
--    anon tenía el grant pero ninguna policy (RLS lo frenaba): se limpia igual.
--    promo_codes: anon/authenticated tenían INSERT/UPDATE/DELETE/TRUNCATE
--    (TRUNCATE no pasa por RLS); todo se escribe con service role.
-- 2) Precio sin fase activa: get_event_active_prices caía a
--    ticket_types.price_cents, que en la práctica es el precio MÁS BARATO.
--    Con fases con fecha de fin, al terminar la última (o en un hueco entre
--    dos) se vendía al precio de la primera preventa. Ahora, sin fase activa:
--    la PRÓXIMA fase (antes de la primera o en un hueco: nunca más barato de
--    lo que viene); si no hay próxima, la última que terminó; y recién sin
--    fases, el precio base. armarEscalera (conceptos.tsx) replica la regla
--    para que lo que se MUESTRA sea lo que se COBRA. Mismo RETURNS: CREATE OR
--    REPLACE conserva los grants (pública a propósito: la página la usa).
-- 3) TRUNCATE no pasa por RLS: nadie con JWT lo necesita en ninguna tabla.
-- =============================================================

revoke update on public.orders, public.tickets, public.yape_proofs from anon, authenticated;
revoke insert, update, delete, truncate on public.promo_codes from anon, authenticated;
revoke truncate on all tables in schema public from anon, authenticated;

drop policy if exists orders_update_brand on public.orders;
drop policy if exists tickets_validate_brand on public.tickets;
drop policy if exists yape_proofs_update_brand on public.yape_proofs;

create or replace function public.get_event_active_prices(p_event_id uuid)
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
    coalesce(act.price_cents, nx.price_cents, prev.price_cents, tt.price_cents) as active_price_cents,
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
    select p.price_cents
    from public.ticket_type_price_phases p
    where p.ticket_type_id = tt.id
      and p.ends_at is not null
      and p.ends_at <= now()
    order by p.ends_at desc, p.sort_order desc
    limit 1
  ) prev on true
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
