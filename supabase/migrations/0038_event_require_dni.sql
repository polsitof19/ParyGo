-- =============================================================
-- 0038 — DNI configurable por evento (Tanda 1 / Grupo B). Solo config de checkout;
-- NO toca emisión, validate, settle, aforo, contador, precio.
-- =============================================================
-- require_dni: si true, el checkout pide + exige el documento (DNI/CE/pasaporte).
-- DEFAULT TRUE → mantiene el comportamiento actual (hoy el DNI es obligatorio,
-- migr 0026). El organizador puede desactivarlo por evento (menos fricción) desde
-- el panel. Additiva, backwards-compatible.
-- =============================================================
alter table public.events add column if not exists require_dni boolean not null default true;
