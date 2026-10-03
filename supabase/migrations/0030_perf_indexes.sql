-- =============================================================
-- 0030 — Índices de performance (Fase 1 de escala). ADITIVO, no toca datos.
-- =============================================================
-- Confirmados faltantes en el inventario de prod (pg_indexes):
--  1. tickets(ticket_type_id) — el trigger recompute_ticket_type_sold hace
--     COUNT(*) WHERE ticket_type_id=X en cada emisión; hoy sin índice → seq scan
--     O(n) por ticket. Parcial por invalidated_at IS NULL (el mismo filtro del
--     COUNT) para que sirva exacto y sea más chico.
--  2. orders(event_id, status) — los reads del panel filtran event_id + status
--     ('paid'); hoy hay índices sueltos por event_id y por status, pero no el
--     compuesto que cubre el patrón real.
--  3. ticket_scans(brand_id, scanned_at) y (validator_user_id) — reportes de
--     accesos/rechazos por marca y trazabilidad por validador; hoy solo hay
--     índice por (event_id) y (ticket_id).
--
-- CREATE INDEX IF NOT EXISTS (no CONCURRENTLY: el runner de la Management API
-- envuelve en transacción y CONCURRENTLY no se permite ahí; las tablas son chicas
-- hoy). Idempotente. NO toca emisión/validate/settle/RLS.
-- =============================================================

create index if not exists tickets_ticket_type_active_idx
  on public.tickets (ticket_type_id)
  where invalidated_at is null;

create index if not exists orders_event_status_idx
  on public.orders (event_id, status);

create index if not exists ticket_scans_brand_idx
  on public.ticket_scans (brand_id, scanned_at desc);

create index if not exists ticket_scans_validator_idx
  on public.ticket_scans (validator_user_id)
  where validator_user_id is not null;

notify pgrst, 'reload schema';
