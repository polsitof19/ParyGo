-- =============================================================
-- 0043 — Fix: grant SELECT de las columnas notify_yape_* a authenticated
-- =============================================================
-- BUG (introducido en 0039, TANDA 1): brands tiene grants a nivel de COLUMNA.
-- Al agregar brands.notify_yape_recovery / notify_yape_digest NO se concedió
-- SELECT a authenticated, así que el query de /admin/settings (que las lee con
-- el cliente de SESIÓN del brand_admin) fallaba con 42501 → la página de
-- configuración del organizador quedaba EN BLANCO para todos los brand_admin.
--
-- Estas dos columnas son booleanos no sensibles (preferencias de aviso). Se
-- conceden SOLO a authenticated (el dueño lee/edita su propia config); anon NO
-- las necesita (el checkout público no las selecciona). Idempotente.
-- =============================================================

grant select (notify_yape_recovery, notify_yape_digest) on public.brands to authenticated;

notify pgrst, 'reload schema';
