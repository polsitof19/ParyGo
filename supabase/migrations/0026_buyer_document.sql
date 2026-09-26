-- =============================================================
-- 0026 · Documento de identidad del comprador (captura en checkout)
-- =============================================================
-- Para validar identidad en la puerta. La columna `buyer_dni` (texto) YA existe
-- desde 0001 pero nunca se llenaba (el checkout no la capturaba). Acá:
--   - Reusamos `buyer_dni` como NÚMERO de documento (DNI/CE/pasaporte).
--   - Agregamos `buyer_doc_type` para soportar también extranjeros (CE/pasaporte),
--     que sí compran en eventos de Lima. Default 'dni'.
--
-- PII: `orders` ya está bajo RLS — `orders_read_by_brand` (0005) deja leer solo a
-- super_admin / brand_admin de la marca; 0021 revocó insert/delete/update a
-- anon+authenticated (solo service_role escribe vía startCheckout). El número de
-- documento hereda esa protección: anon NO lo lee ni lo escribe. No se expone en
-- ningún endpoint público ni se loguea.
--
-- Aditiva, idempotente, backwards-compatible (órdenes viejas → default 'dni',
-- buyer_dni queda null). No toca la lógica de pago/promo/stock.
-- =============================================================

alter table public.orders
  add column if not exists buyer_doc_type text not null default 'dni';

-- Check constraint idempotente (DNI | Carné de Extranjería | Pasaporte).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_buyer_doc_type_chk'
  ) then
    alter table public.orders
      add constraint orders_buyer_doc_type_chk
      check (buyer_doc_type in ('dni', 'ce', 'passport'));
  end if;
end $$;

comment on column public.orders.buyer_dni is
  'Número de documento de identidad del comprador (DNI/CE/pasaporte). PII — orders bajo RLS, no legible por anon.';
comment on column public.orders.buyer_doc_type is
  'Tipo de documento del comprador: dni | ce | passport. Default dni.';
