-- =============================================================
-- 0009 · Harden get_event_active_prices: published events only
-- =============================================================
-- get_event_active_prices is SECURITY DEFINER and bypasses RLS. Gate it to
-- published events so it never discloses prices of unpublished/draft events
-- (low severity — prices/dates only, no PII — but good hygiene, matching the
-- ticket_types_read_public RLS posture). Callers (startCheckout, public page)
-- only ever resolve prices for published events, so this is non-breaking.
-- =============================================================

create or replace function public.get_event_active_prices(p_event_id uuid)
returns table (
  ticket_type_id     uuid,
  active_price_cents integer,
  next_price_cents   integer,
  next_starts_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tt.id,
    coalesce(act.price_cents, tt.price_cents) as active_price_cents,
    nx.price_cents as next_price_cents,
    nx.starts_at   as next_starts_at
  from public.ticket_types tt
  join public.events e on e.id = tt.event_id and e.is_published = true
  left join lateral (
    select p.price_cents
    from public.ticket_type_price_phases p
    where p.ticket_type_id = tt.id
      and (p.starts_at is null or now() >= p.starts_at)
      and (p.ends_at   is null or now() <  p.ends_at)
    order by p.starts_at desc nulls last, p.sort_order desc
    limit 1
  ) act on true
  left join lateral (
    select p.price_cents, p.starts_at
    from public.ticket_type_price_phases p
    where p.ticket_type_id = tt.id
      and p.starts_at is not null
      and p.starts_at > now()
    order by p.starts_at asc, p.sort_order asc
    limit 1
  ) nx on true
  where tt.event_id = p_event_id;
$$;
