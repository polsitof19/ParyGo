-- =============================================================
-- 0023 — Credenciales MP self-service del brand_admin (Sprint 4 · PASO 2.1)
--
-- PROBLEMA 1 (autoridad): set_brand_mp_credentials (0003) tenía un guard
-- INTERNO `is_super_admin()`. Esa función lee auth.uid(); bajo el cliente
-- service_role (que es como el server llama a la RPC) auth.uid() es NULL →
-- is_super_admin() = false → la RPC SIEMPRE lanzaba 'permission denied: super
-- admin required'. Es decir, la RPC era INCALLABLE por el server: el propio
-- flujo super-admin de carga de credenciales MP (createBrandAction) estaba roto.
--
-- PROBLEMA 2 (latente, lo enmascaraba el guard): set/get usaban pgp_sym_encrypt
-- / pgp_sym_decrypt sin calificar, con search_path = public. En Supabase
-- pgcrypto vive en el schema `extensions`, no en `public` → 'function
-- pgp_sym_encrypt does not exist'. Como el guard nunca dejaba llegar a esa
-- línea, el bug jamás se disparó. Todo el chain de creds MP estaba muerto.
--
-- SOLUCIÓN:
--  * Quitar el guard interno. La autoridad se enforcea en la CAPA DE APP
--    (server action: requireSession + membership; brand_id sale de la SESIÓN,
--    nunca del cliente), igual que updateBrandSettingsAction. La RPC sigue
--    service_role-only (lockdown 0014, re-aseverado) → anon/authenticated no
--    pueden llamarla directo. Habilita el self-service (2.1) y ARREGLA el
--    flujo super-admin.
--  * Calificar pgcrypto como `extensions.pgp_sym_*` (robusto ante search_path).
--
-- get_brand_mp_status: el panel necesita saber si las creds están cargadas SIN
-- desencriptar ni exponer el ciphertext → devuelve solo booleanos.
-- get_brand_mp_credentials (lectura desencriptada): se re-crea con el fix de
-- `extensions.pgp_sym_decrypt`; sigue service_role-only, solo server-side.
-- Idempotente.
-- =============================================================

create or replace function public.set_brand_mp_credentials(
  p_brand_id uuid,
  p_access_token text,
  p_public_key text,
  p_encryption_key text
) returns void language plpgsql security definer set search_path = public as $$
begin
  -- Autoridad enforced por el llamador (server action: service_role + sesión).
  -- p_*=null limpia la credencial correspondiente.
  update public.brands set
    mp_access_token_enc = case when p_access_token is null then null
                               else extensions.pgp_sym_encrypt(p_access_token, p_encryption_key) end,
    mp_public_key_enc   = case when p_public_key is null then null
                               else extensions.pgp_sym_encrypt(p_public_key, p_encryption_key) end
  where id = p_brand_id;
end; $$;

create or replace function public.get_brand_mp_credentials(
  p_brand_id uuid,
  p_encryption_key text
) returns table (access_token text, public_key text)
language plpgsql security definer set search_path = public as $$
begin
  return query
    select extensions.pgp_sym_decrypt(mp_access_token_enc, p_encryption_key)::text,
           extensions.pgp_sym_decrypt(mp_public_key_enc, p_encryption_key)::text
    from public.brands
    where id = p_brand_id;
end; $$;

-- Estado de credenciales SIN desencriptar (para el panel: configurado / no).
create or replace function public.get_brand_mp_status(p_brand_id uuid)
returns table (has_access_token boolean, has_public_key boolean)
language sql stable security definer set search_path = public as $$
  select mp_access_token_enc is not null, mp_public_key_enc is not null
  from public.brands where id = p_brand_id;
$$;

-- Lockdown (lección 0014): revoke explícito de anon Y authenticated; solo
-- service_role ejecuta. Re-aseverado para las tres funciones MP.
revoke execute on function public.set_brand_mp_credentials(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.get_brand_mp_credentials(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_brand_mp_status(uuid) from public, anon, authenticated;
grant execute on function public.set_brand_mp_credentials(uuid, text, text, text) to service_role;
grant execute on function public.get_brand_mp_credentials(uuid, text) to service_role;
grant execute on function public.get_brand_mp_status(uuid) to service_role;

-- -------------------------------------------------------------
-- Aislamiento de columnas sensibles de brands (creds no legibles por cliente)
-- -------------------------------------------------------------
-- La policy brands_read_public es `to public` con `using (true)` (sin scoping
-- de fila — info pública de marca para compradores anónimos), y `authenticated`
-- tenía SELECT a NIVEL TABLA → CUALQUIER usuario authenticated (cualquier
-- brand_admin/validator) podía leer de CUALQUIER brand:
--   * mp_access_token_enc / mp_public_key_enc (ciphertext)
--   * mp_webhook_secret (¡PLAINTEXT! → forja de webhooks de pago aprobado)
-- El server lee esas columnas vía service_role (get_brand_mp_credentials; el
-- webhook lee mp_webhook_secret con admin client) → no necesita el grant a
-- authenticated. Restringimos authenticated a las columnas NO sensibles (anon ya
-- estaba restringido a columnas públicas desde 0005).
revoke select on public.brands from authenticated;
grant select (
  id, slug, name, whatsapp_e164, yape_number, yape_holder, theme_json,
  contact_email, created_at, updated_at, event_balance
) on public.brands to authenticated;

-- Refrescar el schema cache de PostgREST (necesario para exponer la nueva RPC).
notify pgrst, 'reload schema';
