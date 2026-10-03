-- =============================================================
-- 0008 · Price phases (fases de preventa automáticas)
-- =============================================================
-- A ticket_type can have N price phases, each with its own price and a
-- time window [starts_at, ends_at). The ACTIVE phase (resolved against
-- now() in UTC — timestamptz is absolute, Lima only matters when loading
-- the dates and when formatting in the UI) determines BOTH the price
-- shown publicly and the price charged at checkout.
--
-- Single source of truth: get_event_active_prices(event_id), a
-- SECURITY DEFINER function consumed by the public event page (anon SSR
-- client) and by startCheckout (service_role). Charging is always
-- server-side; order_items.unit_price_cents snapshots the active price so
-- an order created under phase A is honored at phase A even after it rises.
--
-- Backwards-compatible: a ticket_type WITHOUT phase rows keeps charging
-- ticket_types.price_cents (kept as fallback/cache, not deprecated). The
-- data step below seeds a base phase = current price_cents for every
-- existing ticket_type, so in-flight sales (incl. Almighty) never change
-- price during migration.
--
-- Idempotent: safe to re-run.
-- =============================================================

-- ------- 1. Table -------
create table if not exists public.ticket_type_price_phases (
  id              uuid primary key default uuid_generate_v4(),
  ticket_type_id  uuid not null references public.ticket_types(id) on delete cascade,
  name            text,
  price_cents     integer not null check (price_cents >= 0),
  -- Window [starts_at, ends_at): start inclusive, end EXCLUSIVE.
  --   starts_at null = "from the beginning" (first phase).
  --   ends_at   null = "until the event" (last phase, door price).
  starts_at       timestamptz,
  ends_at         timestamptz,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ttpp_window_valid check (starts_at is null or ends_at is null or starts_at < ends_at),
  constraint ttpp_ticket_sort_uniq unique (ticket_type_id, sort_order)
);

create index if not exists ttpp_ticket_type_idx
  on public.ticket_type_price_phases (ticket_type_id, sort_order);
create index if not exists ttpp_window_idx
  on public.ticket_type_price_phases (ticket_type_id, ends_at);

drop trigger if exists ttpp_updated_at on public.ticket_type_price_phases;
create trigger ttpp_updated_at before update on public.ticket_type_price_phases
  for each row execute function bump_updated_at();

-- ------- 2. RLS (mirrors ticket_types) -------
alter table public.ticket_type_price_phases enable row level security;

drop policy if exists ttpp_read_public on public.ticket_type_price_phases;
create policy ttpp_read_public on public.ticket_type_price_phases for select
  using (
    exists (
      select 1 from public.ticket_types tt
      join public.events e on e.id = tt.event_id
      where tt.id = ticket_type_id
        and tt.is_active = true
        and e.is_published = true
    )
  );

drop policy if exists ttpp_read_internal on public.ticket_type_price_phases;
create policy ttpp_read_internal on public.ticket_type_price_phases for select
  to authenticated
  using (
    is_super_admin()
    or exists (
      select 1 from public.ticket_types tt
      join public.events e on e.id = tt.event_id
      where tt.id = ticket_type_id and user_is_brand_member(e.brand_id)
    )
  );

drop policy if exists ttpp_write_brand on public.ticket_type_price_phases;
create policy ttpp_write_brand on public.ticket_type_price_phases for all
  to authenticated
  using (
    is_super_admin()
    or exists (
      select 1 from public.ticket_types tt
      join public.events e on e.id = tt.event_id
      where tt.id = ticket_type_id and user_is_brand_member(e.brand_id, 'brand_admin')
    )
  )
  with check (
    is_super_admin()
    or exists (
      select 1 from public.ticket_types tt
      join public.events e on e.id = tt.event_id
      where tt.id = ticket_type_id and user_is_brand_member(e.brand_id, 'brand_admin')
    )
  );

-- ------- 3. Single source of truth: active price per ticket_type of an event -------
-- Returns one row per ticket_type of the event:
--   active_price_cents : price of the phase active right now (fallback to
--                        ticket_types.price_cents if no phase matches).
--   next_price_cents   : price of the next upcoming phase (null if none).
--   next_starts_at     : when that next phase begins (= when price rises).
-- SECURITY DEFINER so the anon SSR client can call it without needing
-- direct table RLS access; it exposes only prices/dates (no PII).
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

revoke execute on function public.get_event_active_prices(uuid) from public;
grant execute on function public.get_event_active_prices(uuid) to anon, authenticated, service_role;

-- ------- 4. DATA: base phase = current price for EVERY ticket_type -------
-- Preserves today's price for all ticket_types (incl. in-flight Almighty).
-- Only inserts where the ticket_type has no phases yet → idempotent.
insert into public.ticket_type_price_phases (ticket_type_id, name, price_cents, starts_at, ends_at, sort_order)
select tt.id, 'Precio base', tt.price_cents, null, null, 0
from public.ticket_types tt
where not exists (
  select 1 from public.ticket_type_price_phases p where p.ticket_type_id = tt.id
);

-- ------- 5. DATA: real phases for Almighty (Code) -------
-- Lima boundaries as exclusive midnight (UTC+5h):
--   "hasta 5 jun 23:59"  -> ends 2026-06-06 00:00 Lima = 2026-06-06 05:00:00+00
--   "hasta 19 jun 23:59" -> ends 2026-06-20 00:00 Lima = 2026-06-20 05:00:00+00
--   "hasta evento"       -> ends null (door price)
-- Remove the base phase seeded in step 4 for these two, then load real ones.
delete from public.ticket_type_price_phases
where ticket_type_id in (
  'ccfea311-3607-4959-89b9-ee6009894dea',  -- General
  'c0c0d710-672d-4874-9f34-7ab998fe9a2e'   -- VIP
) and name = 'Precio base';

-- General: S/30 -> S/40 -> S/50
insert into public.ticket_type_price_phases (ticket_type_id, name, price_cents, starts_at, ends_at, sort_order) values
  ('ccfea311-3607-4959-89b9-ee6009894dea', 'Preventa 1', 3000, null,                     '2026-06-06 05:00:00+00', 1),
  ('ccfea311-3607-4959-89b9-ee6009894dea', 'Preventa 2', 4000, '2026-06-06 05:00:00+00', '2026-06-20 05:00:00+00', 2),
  ('ccfea311-3607-4959-89b9-ee6009894dea', 'Puerta',     5000, '2026-06-20 05:00:00+00', null,                     3)
on conflict (ticket_type_id, sort_order) do nothing;

-- VIP: S/40 -> S/50 -> S/60
insert into public.ticket_type_price_phases (ticket_type_id, name, price_cents, starts_at, ends_at, sort_order) values
  ('c0c0d710-672d-4874-9f34-7ab998fe9a2e', 'Preventa 1', 4000, null,                     '2026-06-06 05:00:00+00', 1),
  ('c0c0d710-672d-4874-9f34-7ab998fe9a2e', 'Preventa 2', 5000, '2026-06-06 05:00:00+00', '2026-06-20 05:00:00+00', 2),
  ('c0c0d710-672d-4874-9f34-7ab998fe9a2e', 'Puerta',     6000, '2026-06-20 05:00:00+00', null,                     3)
on conflict (ticket_type_id, sort_order) do nothing;
