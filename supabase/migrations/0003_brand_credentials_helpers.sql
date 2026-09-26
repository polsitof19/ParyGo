-- =============================================================
-- ParyGo · helper functions for encrypted brand credentials
-- =============================================================
-- MercadoPago credentials are stored encrypted with pgp_sym_encrypt using a
-- key only known to the server (BRAND_CREDS_ENCRYPTION_KEY env var).
--
-- These functions are SECURITY DEFINER but lock down access via internal
-- guards: only super_admin can write, only specific server flows can read.
-- =============================================================

create or replace function set_brand_mp_credentials(
  p_brand_id uuid,
  p_access_token text,
  p_public_key text,
  p_encryption_key text
) returns void as $$
begin
  if not is_super_admin() then
    raise exception 'permission denied: super admin required';
  end if;
  update brands
  set
    mp_access_token_enc = case when p_access_token is null then null
                               else pgp_sym_encrypt(p_access_token, p_encryption_key) end,
    mp_public_key_enc   = case when p_public_key is null then null
                               else pgp_sym_encrypt(p_public_key, p_encryption_key) end
  where id = p_brand_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function get_brand_mp_credentials(
  p_brand_id uuid,
  p_encryption_key text
) returns table (access_token text, public_key text) as $$
begin
  -- This is server-side only; callers must use service-role client.
  return query
    select
      pgp_sym_decrypt(mp_access_token_enc, p_encryption_key)::text,
      pgp_sym_decrypt(mp_public_key_enc, p_encryption_key)::text
    from brands
    where id = p_brand_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Restrict execution: only service_role can call these (they handle the key).
revoke execute on function set_brand_mp_credentials(uuid, text, text, text) from public;
revoke execute on function get_brand_mp_credentials(uuid, text) from public;
grant execute on function set_brand_mp_credentials(uuid, text, text, text) to service_role;
grant execute on function get_brand_mp_credentials(uuid, text) to service_role;
