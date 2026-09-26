-- =============================================================
-- 0021 — Cerrar INSERT anon/authenticated en orders + order_items
-- (Sprint 4 · PASO 2.0.1 — BLOQUEANTE antes de MercadoPago)
--
-- PROBLEMA: las policies `*_insert_public` (0001) permitían a anon Y
-- authenticated insertar filas ARBITRARIAS con `with check (true)`:
--   * order_items con unit_price/quantity falsos
--   * orders falsas (cualquier monto/estado)
-- Superficie innecesaria que con MercadoPago (2º camino de dinero) se vuelve
-- peligrosa. (Detectado en el security-review de M1 / 0020.)
--
-- VERIFICACIÓN (antes de cerrar): el ÚNICO sitio que inserta orders y
-- order_items en todo apps/ es startCheckout (server action) usando
-- createAdminClient() = service_role, que BYPASSA RLS. Grep multilínea
-- exhaustivo: no hay ningún otro insert (ni client-side, ni /api, ni RPC con
-- rol anon). El webhook MP y resend-ticket-email solo UPDATE/SELECT/log.
-- => Cerrar estas policies NO afecta el checkout real (service_role) ni las
--    lecturas/updates de brand_admin (sus policies se conservan).
--
-- Se conservan: order_items_read_by_brand (SELECT), orders_read_by_brand
-- (SELECT), orders_update_brand (UPDATE brand_admin). Solo se elimina el INSERT
-- público. Defensa en profundidad: además se revoca el privilegio de tabla
-- INSERT/TRUNCATE de anon/authenticated (no lo necesita ningún flujo legítimo;
-- el insert va por service_role). Idempotente.
-- =============================================================

-- 1. Quitar el INSERT público (la corrección funcional: sin policy permisiva de
--    INSERT, RLS deniega el insert de anon/authenticated; service_role bypassa).
drop policy if exists order_items_insert_public on public.order_items;
drop policy if exists orders_insert_public on public.orders;

-- 2. Defensa en profundidad: revocar el grant de tabla de escritura que ningún
--    rol anon/authenticated usa. service_role no se ve afectado.
--    - order_items: no tiene NINGUNA policy de INSERT/UPDATE/DELETE → se revocan
--      las tres (RLS ya las negaba; esto cierra el grant residual por si alguien
--      agrega una policy por error en el futuro). Se conserva SELECT (read policy).
--    - orders: se conserva UPDATE (orders_update_brand, brand_admin) y SELECT;
--      se revocan INSERT (el hueco) y DELETE (ninguna policy de delete existe).
revoke insert, update, delete, truncate on public.order_items from anon, authenticated;
revoke insert, delete, truncate           on public.orders      from anon, authenticated;
