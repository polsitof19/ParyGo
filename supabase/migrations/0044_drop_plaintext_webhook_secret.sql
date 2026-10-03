-- =============================================================
-- 0044 — Limpieza: dropear la columna legacy brands.mp_webhook_secret (plano)
-- =============================================================
-- Hallazgo menor de la auditoría: la columna de texto plano mp_webhook_secret
-- (del 0001) quedó VACÍA desde 0034 (el secret se guarda encriptado en
-- mp_webhook_secret_enc y set_brand_mp_webhook_secret nullea el plano en cada
-- escritura). Confirmado 0 filas pobladas. La dropeamos.
--
-- Antes de dropear hay que sacarle la referencia a la columna de las funciones
-- que la tocan, si no rompería en runtime:
--   · set_brand_mp_webhook_secret: se recrea SIN `mp_webhook_secret = null`
--     (el encriptado en mp_webhook_secret_enc es idéntico; el webhook lee el _enc
--     vía get_brand_mp_webhook_secret, que NO cambia).
--   · migrate_brand_webhook_secret_to_enc: backfill one-shot ya ejecutado y sin
--     más uso → se dropea.
-- NO toca la verificación del webhook (HMAC) ni get_brand_mp_webhook_secret.
-- =============================================================

create or replace function public.set_brand_mp_webhook_secret(
  p_brand_id uuid, p_secret text, p_encryption_key text
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.brands set
    mp_webhook_secret_enc = case when p_secret is null then null
                                 else extensions.pgp_sym_encrypt(p_secret, p_encryption_key) end
  where id = p_brand_id;
end; $$;

-- Lockdown 0014 (re-asertado): solo service_role.
revoke execute on function public.set_brand_mp_webhook_secret(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_brand_mp_webhook_secret(uuid, text, text) to service_role;

-- Backfill one-shot ya corrido → fuera.
drop function if exists public.migrate_brand_webhook_secret_to_enc(text);

-- Ahora sí, dropear la columna legacy vacía.
alter table public.brands drop column if exists mp_webhook_secret;

notify pgrst, 'reload schema';
