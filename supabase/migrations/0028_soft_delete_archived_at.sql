-- =============================================================
-- 0028 — Soft-delete: archived_at en events y brands
-- =============================================================
-- ARCHIVAR = ocultar reversible, NO borrar. Un registro con archived_at != null
-- queda OCULTO de todo lo público (home de marca, checkout, página de evento,
-- listados, JSON-LD) pero conserva TODO su historial (órdenes, tickets, saldo).
-- Desarchivar = volver a archived_at = null.
--
-- Additivo e idempotente. Default null = activo (todo lo existente sigue activo).
-- El filtrado público se hace por query (archived_at IS NULL) en cada superficie
-- pública; esta migración solo agrega la columna + índices parciales para que los
-- listados públicos sigan siendo rápidos.
--
-- NO toca: emisión, validate_ticket, settle, apply_promo, RLS de tickets/orders,
-- saldo, max_scans, precio congelado. Solo agrega columnas + índices.
-- =============================================================

alter table public.events add column if not exists archived_at timestamptz;
alter table public.brands add column if not exists archived_at timestamptz;

-- Índices parciales: aceleran los listados públicos (solo filas activas).
create index if not exists events_brand_active_idx
  on public.events (brand_id, starts_at)
  where archived_at is null;

create index if not exists brands_active_slug_idx
  on public.brands (slug)
  where archived_at is null;

notify pgrst, 'reload schema';
