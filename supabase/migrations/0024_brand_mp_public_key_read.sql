-- =============================================================
-- 0024 — Lectura del public_key de MP para el checkout (Sprint 4 · PASO 2.2)
--
-- El Wallet Brick de MercadoPago (MP.js) necesita el public_key del brand EN EL
-- BROWSER del comprador (es inherentemente público). Pero el public_key se
-- guarda ENCRIPTADO (mp_public_key_enc). get_brand_mp_credentials desencripta
-- AMBOS (access_token + public_key) y es service_role-only; para no traer el
-- access_token a memoria del server innecesariamente cuando solo necesitamos el
-- public_key, agregamos un lector dedicado de mínimo privilegio.
--
-- El server (page del evento, server component) lo llama vía service_role y pasa
-- SOLO el public_key como prop al cliente. El access_token JAMÁS sale del server.
-- service_role-only (lockdown 0014). Idempotente.
-- =============================================================

create or replace function public.get_brand_mp_public_key(
  p_brand_id uuid,
  p_encryption_key text
) returns text
language sql stable security definer set search_path = public as $$
  select extensions.pgp_sym_decrypt(mp_public_key_enc, p_encryption_key)::text
  from public.brands
  where id = p_brand_id and mp_public_key_enc is not null;
$$;

revoke execute on function public.get_brand_mp_public_key(uuid, text) from public, anon, authenticated;
grant execute on function public.get_brand_mp_public_key(uuid, text) to service_role;

notify pgrst, 'reload schema';
