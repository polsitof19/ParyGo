-- =============================================================
-- 0037 — Página pública: (1) confirmación +18 configurable por evento,
-- (3) enlace de Google Maps de la ubicación. Solo presentación/config; NO toca
-- emisión, validate, settle, aforo, contador ni precio.
-- =============================================================
-- (1) require_age_confirmation: si true, el checkout pide el checkbox "+N años".
--     DEFAULT false → por defecto NO se pide (decisión de producto). Un evento con
--     alcohol que lo necesite legalmente lo activa desde el panel.
-- (3) venue_maps_url: enlace de Google Maps que el organizador puede pegar para el
--     botón "Cómo llegar". El embed del mapa se arma desde venue_address (sin key).
-- Ambas additivas, backwards-compatible (la app vieja ignora las columnas).
-- =============================================================

alter table public.events add column if not exists require_age_confirmation boolean not null default false;
alter table public.events add column if not exists venue_maps_url text;
