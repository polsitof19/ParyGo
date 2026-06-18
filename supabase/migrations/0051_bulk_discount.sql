-- =============================================================
-- 0051 — Descuento por cantidad (bulk) por tipo de entrada
-- =============================================================
-- El organizador puede ofrecer "llevá N+ de este tipo y pagá X% menos". Es
-- automático (sin código) y se calcula + congela SERVER-SIDE en el checkout
-- (startCheckout), igual que el precio de fase. Reglas:
--   - bulk_min_qty = 0  → sin descuento por cantidad (default).
--   - si quantity >= bulk_min_qty → se aplica bulk_discount_pct sobre el precio
--     de la fase activa de ESE tipo (por línea).
--   - Mutuamente EXCLUYENTE con los códigos promo: si el comprador usa un código,
--     gana el código y NO se aplica bulk (evita apilar descuentos / conflicto con
--     base_price_cents y apply_promo_to_order). Esa regla vive en startCheckout.
--
-- Solo columnas (additivo); el cobro (MP/Yape) sigue contrastando orders.total_cents,
-- que startCheckout ya congela con el precio efectivo. No toca RPCs de emisión.
-- =============================================================

alter table public.ticket_types add column if not exists bulk_min_qty int not null default 0;
alter table public.ticket_types add column if not exists bulk_discount_pct int not null default 0;

-- Rangos sanos (idempotente: drop+add).
alter table public.ticket_types drop constraint if exists ticket_types_bulk_minqty_chk;
alter table public.ticket_types add constraint ticket_types_bulk_minqty_chk
  check (bulk_min_qty >= 0 and bulk_min_qty <= 50);
alter table public.ticket_types drop constraint if exists ticket_types_bulk_pct_chk;
alter table public.ticket_types add constraint ticket_types_bulk_pct_chk
  check (bulk_discount_pct >= 0 and bulk_discount_pct <= 90);

notify pgrst, 'reload schema';
