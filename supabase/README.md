# Supabase — ParyGo

Migrations + seed scripts. Single source of truth for the database.

## Apply migrations

### Cloud (Supabase Dashboard)

1. Crear proyecto en https://supabase.com/dashboard
2. Settings → Database → copiar connection string
3. Ejecutar migrations en orden, una por una, desde el SQL editor:
   - `migrations/0001_initial_schema.sql`
   - `migrations/0002_storage_buckets.sql`
   - `migrations/0003_brand_credentials_helpers.sql`
4. Settings → API → copiar:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (secret)
5. Generar `BRAND_CREDS_ENCRYPTION_KEY` con `openssl rand -hex 32` y guardar en env.

### Local (Supabase CLI)

```bash
# Install once
brew install supabase/tap/supabase

# From repo root
cd supabase
supabase start                       # spins up local postgres
supabase db reset                    # applies all migrations
```

## Generate TypeScript types

After applying migrations:

```bash
cd apps/web
SUPABASE_PROJECT_REF=xxxx npm run db:types
```

This regenerates `lib/supabase/database.types.ts`.

## Schema overview

```
brands ──┬─ brand_members ── auth.users
         │                     ↑
         ├─ validator_codes ───┘
         │
         ├─ events ──┬─ ticket_types
         │           └─ orders ── order_items
         │                   │
         │                   ├── tickets (qr_code UUID)
         │                   └── yape_proofs
         │
         └─ events_log (audit)
```

## Key invariants

- **Money is integer cents** everywhere
- **`mp_payment_id` UNIQUE** = webhook idempotency
- **`qr_code` UUID v4** = unguessable
- **`ticket_types.sold`** is denormalized, kept in sync by `tickets_counter` trigger
- **MP credentials** stored encrypted with `pgp_sym_encrypt`, decrypt only via `get_brand_mp_credentials` (service-role only)
- **RLS enabled on every tenant-scoped table**

## Roles

- `super_admin` — set via `user_profiles.is_super_admin = true` (no UI; manual SQL or seed)
- `brand_admin` — `brand_members.role = 'brand_admin'`
- `validator` — `brand_members.role = 'validator'`

## Seed for first event (Code)

Run after migrations + after creating the super admin user in Supabase Auth:

```sql
-- Mark Paul as super admin
update user_profiles
set is_super_admin = true
where user_id = '<paul-supabase-user-id>';

-- Or insert if profile doesn't exist yet (trigger should create on signup)
insert into user_profiles (user_id, is_super_admin, display_name)
values ('<paul-supabase-user-id>', true, 'Paul')
on conflict (user_id) do update set is_super_admin = true;
```
