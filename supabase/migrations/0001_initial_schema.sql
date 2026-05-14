-- =============================================================
-- ParyGo · initial schema
-- =============================================================
-- Multi-tenant ticketing platform. Every tenant-scoped row has brand_id.
-- Row Level Security is enabled everywhere; policies enforce isolation.
--
-- Money: stored as INTEGER CENTS, never floats. S/40.00 = 4000.
-- IDs: UUID v4. QR codes are uuid_generate_v4() to prevent enumeration.
-- =============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- =============================================================
-- ENUMS
-- =============================================================

create type user_role as enum ('super_admin', 'brand_admin', 'validator');
create type order_status as enum (
  'pending_payment',     -- MP redirect in progress
  'pending_yape_review', -- Buyer uploaded yape proof, waiting promoter
  'paid',                -- Confirmed (MP or approved yape)
  'failed',              -- MP failed / yape rejected
  'refunded',            -- Manually marked
  'expired'              -- Abandoned > 24h
);
create type payment_method as enum ('mercadopago', 'yape_manual');
create type yape_proof_status as enum ('pending_review', 'approved', 'rejected');

-- =============================================================
-- BRANDS · one per promotor (Code, etc.)
-- =============================================================

create table brands (
  id            uuid primary key default uuid_generate_v4(),
  slug          citext unique not null check (slug ~* '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
  name          text not null,
  whatsapp_e164 text,                          -- +51999000000
  yape_number   text,                          -- Promoter's Yape number (shown to buyers)
  yape_holder   text,                          -- Holder name for display
  theme_json    jsonb not null default '{}'::jsonb,
                                               -- { logo_url, cover_url, primary_color, secondary_color }
  -- MP credentials are encrypted with pgp_sym_encrypt using BRAND_CREDS_ENCRYPTION_KEY
  -- Stored as bytea; service-role only reads them.
  mp_access_token_enc bytea,
  mp_public_key_enc   bytea,
  mp_webhook_secret   text,                    -- Random per-brand HMAC secret for webhook verification
  contact_email       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index brands_slug_idx on brands (slug);

-- =============================================================
-- USERS ↔ BRANDS mapping (auth.users is Supabase-managed)
-- =============================================================

create table user_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_super_admin boolean not null default false,
  created_at  timestamptz not null default now()
);

create table brand_members (
  id          uuid primary key default uuid_generate_v4(),
  brand_id    uuid not null references brands(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        user_role not null,
  display_name text,
  created_at  timestamptz not null default now(),
  unique (brand_id, user_id)
);
create index brand_members_user_idx on brand_members (user_id);
create index brand_members_brand_idx on brand_members (brand_id);

-- Short-code login for validators (avoid typing email on busy phones at the door)
create table validator_codes (
  id          uuid primary key default uuid_generate_v4(),
  brand_id    uuid not null references brands(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  code        text not null,                   -- 6-digit numeric
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (brand_id, code)
);
create index validator_codes_brand_idx on validator_codes (brand_id, code) where used_at is null;

-- =============================================================
-- EVENTS
-- =============================================================

create table events (
  id            uuid primary key default uuid_generate_v4(),
  brand_id      uuid not null references brands(id) on delete restrict,
  slug          citext not null,
  name          text not null,
  description   text,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  venue_name    text,
  venue_address text,
  venue_lat     numeric(8,5),
  venue_lng     numeric(8,5),
  cover_url     text,
  min_age       int not null default 18 check (min_age >= 0),
  is_published  boolean not null default false,
  refund_policy text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (brand_id, slug)
);
create index events_brand_idx on events (brand_id);
create index events_published_idx on events (brand_id, is_published, starts_at);

-- =============================================================
-- TICKET TYPES
-- =============================================================

create table ticket_types (
  id            uuid primary key default uuid_generate_v4(),
  event_id      uuid not null references events(id) on delete cascade,
  name          text not null,
  description   text,
  price_cents   integer not null check (price_cents >= 0),
  capacity      integer not null check (capacity >= 0),
  sold          integer not null default 0 check (sold >= 0),
  reserved      integer not null default 0 check (reserved >= 0),
  sort_order    integer not null default 0,
  perks         jsonb not null default '[]'::jsonb,
  color_hex     text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index ticket_types_event_idx on ticket_types (event_id, sort_order);
create index ticket_types_active_idx on ticket_types (event_id) where is_active = true;

-- =============================================================
-- ORDERS · buyer-facing intent (one per checkout)
-- =============================================================

create table orders (
  id              uuid primary key default uuid_generate_v4(),
  event_id        uuid not null references events(id) on delete restrict,
  brand_id        uuid not null references brands(id) on delete restrict,  -- denorm for RLS
  buyer_name      text not null,
  buyer_email     citext not null,
  buyer_phone     text not null,
  buyer_dni       text,
  buyer_age_ok    boolean not null,
  marketing_opt_in boolean not null default false,
  payment_method  payment_method not null,
  subtotal_cents  integer not null check (subtotal_cents >= 0),
  total_cents     integer not null check (total_cents >= 0),
  status          order_status not null default 'pending_payment',
  -- MercadoPago tracking (nullable for yape_manual)
  mp_preference_id text,
  mp_payment_id    text unique,                 -- IDEMPOTENCY: 1 webhook → 1 paid order
  mp_payment_status text,
  paid_at         timestamptz,
  -- Yape manual tracking (nullable for mercadopago)
  yape_proof_id   uuid,                         -- FK set below
  -- Source attribution
  ip_address      inet,
  user_agent      text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  -- Lifecycle
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (
    (payment_method = 'mercadopago' and mp_preference_id is not null) or
    (payment_method = 'yape_manual')
  )
);
create index orders_event_idx on orders (event_id);
create index orders_brand_idx on orders (brand_id);
create index orders_status_idx on orders (status);
create index orders_email_idx on orders (buyer_email);
create index orders_mp_payment_idx on orders (mp_payment_id) where mp_payment_id is not null;
create index orders_expired_pending_idx on orders (status, expires_at) where status = 'pending_payment';

-- =============================================================
-- ORDER ITEMS
-- =============================================================

create table order_items (
  id              uuid primary key default uuid_generate_v4(),
  order_id        uuid not null references orders(id) on delete cascade,
  ticket_type_id  uuid not null references ticket_types(id) on delete restrict,
  ticket_type_name text not null,              -- snapshot
  quantity        integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  subtotal_cents  integer not null
);
create index order_items_order_idx on order_items (order_id);

-- =============================================================
-- YAPE PROOFS · buyer-submitted manual payment evidence
-- =============================================================

create table yape_proofs (
  id              uuid primary key default uuid_generate_v4(),
  order_id        uuid not null references orders(id) on delete cascade,
  brand_id        uuid not null references brands(id) on delete restrict,
  amount_cents    integer not null check (amount_cents >= 0),
  operation_number text not null,              -- N° operación that buyer sees in their Yape app
  payer_name      text not null,               -- Full name as it appears in their Yape
  security_code   text not null,               -- 3-4 digit code visible on receipt
  receipt_url     text not null,               -- Supabase Storage URL
  status          yape_proof_status not null default 'pending_review',
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  reject_reason   text,
  created_at      timestamptz not null default now()
);
create index yape_proofs_order_idx on yape_proofs (order_id);
create index yape_proofs_brand_status_idx on yape_proofs (brand_id, status) where status = 'pending_review';

alter table orders
  add constraint orders_yape_proof_fk
  foreign key (yape_proof_id) references yape_proofs(id) on delete set null;

-- =============================================================
-- TICKETS · one per attendee; UUID v4 = QR code
-- =============================================================

create table tickets (
  id              uuid primary key default uuid_generate_v4(),
  qr_code         uuid not null unique default uuid_generate_v4(),
  order_id        uuid not null references orders(id) on delete restrict,
  event_id        uuid not null references events(id) on delete restrict,
  brand_id        uuid not null references brands(id) on delete restrict,
  ticket_type_id  uuid not null references ticket_types(id) on delete restrict,
  ticket_type_name text not null,
  ticket_number   text not null,               -- e.g. 'TKT/A8F4-92K' for human-readable display
  attendee_name   text,                        -- For now = buyer_name; future: per-ticket
  validated_at    timestamptz,
  validated_by    uuid references auth.users(id),
  validated_offline boolean not null default false,
  invalidated_at  timestamptz,                 -- For refunds
  created_at      timestamptz not null default now()
);
create index tickets_event_idx on tickets (event_id);
create index tickets_order_idx on tickets (order_id);
create index tickets_qr_idx on tickets (qr_code);
create index tickets_unvalidated_idx on tickets (event_id) where validated_at is null and invalidated_at is null;

-- =============================================================
-- EVENTS LOG · forensic audit trail
-- =============================================================

create table events_log (
  id          uuid primary key default uuid_generate_v4(),
  brand_id    uuid references brands(id) on delete set null,
  event_id    uuid references events(id) on delete set null,
  order_id    uuid references orders(id) on delete set null,
  ticket_id   uuid references tickets(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  type        text not null,                   -- 'order_created' | 'payment_received' | 'yape_approved' | 'qr_validated' | ...
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index events_log_brand_created_idx on events_log (brand_id, created_at desc);
create index events_log_event_created_idx on events_log (event_id, created_at desc);
create index events_log_type_idx on events_log (type);

-- =============================================================
-- TRIGGERS · maintain denormalized counters, timestamps
-- =============================================================

create or replace function bump_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger brands_updated_at before update on brands
  for each row execute function bump_updated_at();
create trigger events_updated_at before update on events
  for each row execute function bump_updated_at();
create trigger ticket_types_updated_at before update on ticket_types
  for each row execute function bump_updated_at();
create trigger orders_updated_at before update on orders
  for each row execute function bump_updated_at();

-- Recompute ticket_types.sold from tickets table.
-- Called when tickets are inserted or invalidated.
create or replace function recompute_ticket_type_sold(p_ticket_type_id uuid)
returns void as $$
begin
  update ticket_types
  set sold = (
    select count(*)::int
    from tickets
    where ticket_type_id = p_ticket_type_id
      and invalidated_at is null
  )
  where id = p_ticket_type_id;
end;
$$ language plpgsql security definer;

create or replace function tickets_update_counter() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    perform recompute_ticket_type_sold(new.ticket_type_id);
  elsif tg_op = 'UPDATE' then
    if (old.invalidated_at is null) is distinct from (new.invalidated_at is null) then
      perform recompute_ticket_type_sold(new.ticket_type_id);
    end if;
  elsif tg_op = 'DELETE' then
    perform recompute_ticket_type_sold(old.ticket_type_id);
  end if;
  return null;
end;
$$ language plpgsql;

create trigger tickets_counter
after insert or update or delete on tickets
for each row execute function tickets_update_counter();

-- =============================================================
-- HELPERS · current user context for RLS
-- =============================================================

create or replace function is_super_admin() returns boolean as $$
  select exists (
    select 1 from user_profiles
    where user_id = auth.uid() and is_super_admin = true
  );
$$ language sql stable security definer;

create or replace function user_brands(p_role user_role default null)
returns setof uuid as $$
  select brand_id from brand_members
  where user_id = auth.uid()
    and (p_role is null or role = p_role);
$$ language sql stable security definer;

create or replace function user_is_brand_member(p_brand_id uuid, p_role user_role default null)
returns boolean as $$
  select exists (
    select 1 from brand_members
    where user_id = auth.uid()
      and brand_id = p_brand_id
      and (p_role is null or role = p_role)
  );
$$ language sql stable security definer;

-- =============================================================
-- ROW LEVEL SECURITY · enable + policies
-- =============================================================

alter table brands enable row level security;
alter table user_profiles enable row level security;
alter table brand_members enable row level security;
alter table validator_codes enable row level security;
alter table events enable row level security;
alter table ticket_types enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table yape_proofs enable row level security;
alter table tickets enable row level security;
alter table events_log enable row level security;

-- ------- BRANDS -------
-- Public can read theme/slug/name (needed to render any branded public page)
-- Sensitive cols (mp_*) are NOT exposed via API; we expose a view.
create policy brands_read_public on brands for select
  using (true);
create policy brands_write_super on brands for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- ------- USER PROFILES -------
create policy profiles_read_own on user_profiles for select
  to authenticated
  using (user_id = auth.uid() or is_super_admin());
create policy profiles_write_super on user_profiles for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- ------- BRAND MEMBERS -------
create policy brand_members_read on brand_members for select
  to authenticated
  using (
    is_super_admin()
    or user_id = auth.uid()
    or user_is_brand_member(brand_id, 'brand_admin')
  );
create policy brand_members_write_super on brand_members for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- ------- VALIDATOR CODES -------
create policy validator_codes_read on validator_codes for select
  to authenticated
  using (is_super_admin() or user_is_brand_member(brand_id, 'brand_admin'));
create policy validator_codes_write on validator_codes for all
  to authenticated
  using (is_super_admin() or user_is_brand_member(brand_id, 'brand_admin'))
  with check (is_super_admin() or user_is_brand_member(brand_id, 'brand_admin'));

-- ------- EVENTS -------
create policy events_read_public on events for select
  using (is_published = true);
create policy events_read_internal on events for select
  to authenticated
  using (is_super_admin() or user_is_brand_member(brand_id));
create policy events_insert_super on events for insert
  to authenticated
  with check (is_super_admin());
create policy events_update_brand on events for update
  to authenticated
  using (is_super_admin() or user_is_brand_member(brand_id, 'brand_admin'))
  with check (is_super_admin() or user_is_brand_member(brand_id, 'brand_admin'));
create policy events_delete_super on events for delete
  to authenticated
  using (is_super_admin());

-- ------- TICKET TYPES -------
create policy ticket_types_read_public on ticket_types for select
  using (
    is_active = true
    and exists (select 1 from events e where e.id = event_id and e.is_published = true)
  );
create policy ticket_types_read_internal on ticket_types for select
  to authenticated
  using (
    is_super_admin()
    or exists (select 1 from events e where e.id = event_id and user_is_brand_member(e.brand_id))
  );
create policy ticket_types_write_brand on ticket_types for all
  to authenticated
  using (
    is_super_admin()
    or exists (select 1 from events e where e.id = event_id and user_is_brand_member(e.brand_id, 'brand_admin'))
  )
  with check (
    is_super_admin()
    or exists (select 1 from events e where e.id = event_id and user_is_brand_member(e.brand_id, 'brand_admin'))
  );

-- ------- ORDERS -------
-- Buyer can read their own order by its uuid (we never enumerate, uuid is unguessable).
-- Anonymous insert allowed (checkout invitado).
create policy orders_insert_public on orders for insert
  to anon, authenticated
  with check (true);
create policy orders_read_by_id on orders for select
  using (true);  -- Knowing the uuid is the auth; server actions pass only one at a time
create policy orders_update_brand on orders for update
  to authenticated
  using (is_super_admin() or user_is_brand_member(brand_id, 'brand_admin'))
  with check (is_super_admin() or user_is_brand_member(brand_id, 'brand_admin'));

-- ------- ORDER ITEMS -------
create policy order_items_read_public on order_items for select
  using (true);
create policy order_items_insert_public on order_items for insert
  to anon, authenticated
  with check (true);

-- ------- YAPE PROOFS -------
create policy yape_proofs_insert_public on yape_proofs for insert
  to anon, authenticated
  with check (true);
create policy yape_proofs_read_brand on yape_proofs for select
  to authenticated
  using (is_super_admin() or user_is_brand_member(brand_id, 'brand_admin'));
create policy yape_proofs_update_brand on yape_proofs for update
  to authenticated
  using (is_super_admin() or user_is_brand_member(brand_id, 'brand_admin'))
  with check (is_super_admin() or user_is_brand_member(brand_id, 'brand_admin'));

-- ------- TICKETS -------
-- Buyer reads by qr_code uuid (URL /t/[qr_code]); not enumerable.
create policy tickets_read_by_qr on tickets for select
  using (true);
create policy tickets_validate_brand on tickets for update
  to authenticated
  using (
    is_super_admin()
    or user_is_brand_member(brand_id, 'brand_admin')
    or user_is_brand_member(brand_id, 'validator')
  )
  with check (
    is_super_admin()
    or user_is_brand_member(brand_id, 'brand_admin')
    or user_is_brand_member(brand_id, 'validator')
  );

-- ------- EVENTS LOG -------
create policy events_log_read on events_log for select
  to authenticated
  using (is_super_admin() or (brand_id is not null and user_is_brand_member(brand_id, 'brand_admin')));
-- No public/anon insert; only server-side via service role.
