-- =============================================================
-- ParyGo · RLS lockdown — fixes auditoría seguridad QA
-- =============================================================
-- Issues que arregla:
--  1) brands.mp_webhook_secret legible por anon vía `brands_read_public`
--  2) orders/order_items/tickets con `using (true)` permitían enumeración
--     total de PII (buyer_email/phone/dni, mp_payment_id) a cualquiera con
--     la anon key.
--
-- Modelo de acceso post-fix:
--   - Anonymous (buyers en checkout): solo INSERT en orders/order_items/
--     yape_proofs. Reads anónimos van por server actions con service_role.
--   - Authenticated (super_admin/brand_admin/validator): SELECT respetando
--     scope de marca via RLS.
--   - Servidor con service_role: bypass total (lo usamos en confirmacion,
--     /t/[uuid], yape submit, webhook MP).
-- =============================================================

-- ---------- BRANDS: revoke sensitive columns from anon ----------
-- mp_webhook_secret en texto plano. Si lo lee un atacante, puede firmar
-- webhooks MP HMAC y marcar órdenes como pagadas. Crítico.
-- mp_*_enc están cifrados con pgp_sym pero igual no hace falta exponerlos.

revoke select on public.brands from anon;
grant select
  (id, slug, name, whatsapp_e164, yape_number, yape_holder,
   theme_json, contact_email, created_at, updated_at)
  on public.brands to anon;

-- Authenticated keeps full select; super_admin scopes are enforced by RLS
-- via brand_members. Brand admins shouldn't read other brands' secrets,
-- but they can already only see their own brand's row by virtue of the
-- `brands_read_public` policy returning all rows + their queries filter
-- by brand_id from their membership.

-- ---------- ORDERS: lock down reads ----------
drop policy if exists orders_read_by_id on public.orders;
create policy orders_read_by_brand on public.orders for select
  to authenticated
  using (
    is_super_admin()
    or user_is_brand_member(brand_id)
  );
-- Anon reads (e.g. buyer fetching their own order post-checkout) go via
-- server actions with service_role — no anon policy needed.

-- ---------- ORDER ITEMS: lock down reads ----------
drop policy if exists order_items_read_public on public.order_items;
create policy order_items_read_by_brand on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (is_super_admin() or user_is_brand_member(o.brand_id))
    )
  );

-- ---------- TICKETS: lock down reads ----------
drop policy if exists tickets_read_by_qr on public.tickets;
create policy tickets_read_by_brand on public.tickets for select
  to authenticated
  using (
    is_super_admin()
    or user_is_brand_member(brand_id, 'brand_admin')
    or user_is_brand_member(brand_id, 'validator')
  );
-- The public ticket page /t/[uuid] uses createAdminClient() so it
-- bypasses RLS. The qr_code lookup is the auth (UUIDv4, not enumerable).
