-- =============================================================
-- 0022 — Hardening de escritura en tablas de dinero/proofs/validación
-- (Sprint 4 · PASO 2.0.1 follow-up — cerrar yape_proofs + defensa en profundidad)
--
-- 1. yape_proofs_insert_public (0001) tenía el MISMO hueco que orders/order_items
--    (0021): anon/authenticated podían insertar comprobantes Yape FALSOS
--    (with check true) → inundar el panel de revisión del promotor (DoS
--    operacional, proofs inventadas). El insert legítimo es submitYapeProof
--    (server action) con createAdminClient() = service_role, que bypassa RLS.
--    => drop de la policy + revoke de INSERT/DELETE/TRUNCATE. Se CONSERVA:
--       - UPDATE (yape_proofs_update_brand: el promotor aprueba/rechaza)
--       - SELECT (yape_proofs_read_brand)
--
-- 2. Defensa en profundidad (tickets, ticket_scans, promo_redemptions): estas
--    NO tienen ninguna policy de INSERT para anon/authenticated → RLS ya niega
--    esos inserts HOY. Revocar el grant de tabla residual cierra el vector por
--    si alguien agrega una policy por error en el futuro. NINGÚN flujo vivo se
--    rompe (si funcionara, existiría una policy). Escritura legítima:
--       - tickets         → issueTickets (service_role)        [conserva UPDATE
--         tickets_validate_brand del validador + SELECT]
--       - ticket_scans    → validate_ticket (SECURITY DEFINER) [solo SELECT]
--       - promo_redemptions → apply_promo / mark / release (DEFINER) [solo SELECT]
--
-- service_role NO se ve afectado por ningún revoke (bypassa RLS y conserva sus
-- grants). Idempotente.
-- =============================================================

-- 1. yape_proofs — cerrar el insert público (corrección funcional).
drop policy if exists yape_proofs_insert_public on public.yape_proofs;
revoke insert, delete, truncate on public.yape_proofs from anon, authenticated;
-- (se conservan UPDATE para yape_proofs_update_brand y SELECT para read_brand)

-- 2. Defensa en profundidad: revocar escritura residual donde ninguna policy la
--    habilita para anon/authenticated.
revoke insert, delete, truncate           on public.tickets           from anon, authenticated;
-- (tickets conserva UPDATE para tickets_validate_brand + SELECT)
revoke insert, update, delete, truncate   on public.ticket_scans      from anon, authenticated;
revoke insert, update, delete, truncate   on public.promo_redemptions from anon, authenticated;

-- 3. Consistencia: anon nunca actualiza yape_proofs/tickets (sus policies UPDATE
--    son `to authenticated`). RLS ya lo bloqueaba; revocamos el grant residual
--    de UPDATE de anon para no dejar un privilegio inerte (security-review W1).
--    authenticated CONSERVA UPDATE (lo necesitan update_brand/validate_brand).
revoke update on public.yape_proofs from anon;
revoke update on public.tickets      from anon;
