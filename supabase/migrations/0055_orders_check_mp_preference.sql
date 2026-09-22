-- =============================================================
-- 0055 — orders_check: la orden puede existir ANTES de la preferencia de MP.
-- =============================================================
-- El bug: orders_check (0001, extendido en 0036) exige
--   payment_method='mercadopago' → mp_preference_id IS NOT NULL
-- pero startCheckout inserta la orden ANTES de crear la preferencia. Resultado:
-- TODO pago con tarjeta falla en el INSERT con un error crudo de Postgres
-- ("violates check constraint orders_check") que además se le muestra al
-- comprador. Es el test K del E2E, rojo desde que existe.
--
-- ---------------------------------------------------------------
-- POR QUÉ SE RELAJA EL CHECK Y NO SE CREA LA PREFERENCIA ANTES
-- ---------------------------------------------------------------
-- La otra salida era invertir el orden: crear la preferencia y después
-- insertar la orden. Es la MENOS segura, por tres razones concretas:
--
--   1. El monto no existe todavía. La preferencia lleva el importe que se le
--      cobra al comprador, y ese importe recién es autoritativo DESPUÉS de
--      insertar order_items y correr apply_promo_to_order (que deriva el
--      descuento de order_items, no de lo que manda el cliente — es el cierre
--      del bug M1). Crear la preferencia antes obliga a calcular el monto con
--      datos del cliente o a mandar uno provisional: exactamente el vector que
--      el sistema cerró.
--
--   2. Dejaría preferencias huérfanas COBRABLES. Si después del insert falla
--      reserve_order_stock (último cupo tomado por otro comprador), ya existe
--      un link de pago vivo en MercadoPago cuya external_reference apunta a una
--      orden que nunca se creó. Alguien paga y el webhook no encuentra qué
--      liquidar: plata entrada sin entrada emitida, y sin rastro del lado
--      nuestro. Hoy el orden actual garantiza que si no hay cupo, no hay link.
--
--   3. Rompe el anti-sobreventa. reserve_order_stock (0031) toma el lock por
--      order_id: sin orden no hay reserva, así que la ventana entre "hay link
--      de pago" y "hay cupo reservado" quedaría abierta.
--
-- ---------------------------------------------------------------
-- QUÉ INVARIANTE SE CONSERVA
-- ---------------------------------------------------------------
-- El check original protegía algo real: una orden de MP que se cobró tiene que
-- ser reconciliable contra MercadoPago, y sin preferencia no lo es. Eso se
-- mantiene INTACTO. Lo único que se permite es la ventana de checkout: una
-- orden de MP puede no tener preferencia mientras NO esté cobrada.
--
-- Concretamente, una orden 'mercadopago' necesita mp_preference_id salvo que
-- esté sin cobrar: status fuera de (paid, refunded) Y sin mp_payment_id.
-- Atar la excepción también a mp_payment_id y no solo al status es a propósito:
-- mp_payment_id es la identidad del pago en MP y es UNIQUE (idempotencia del
-- webhook), así que aunque alguien moviera el status a mano, una orden con
-- pago asociado sigue exigiendo su preferencia.
--
-- Efecto lateral que también arregla: hoy, cuando createMercadoPagoPreference
-- falla, el código hace update({status:'failed'}) con mp_preference_id todavía
-- en NULL — ese UPDATE también violaba el check, así que la orden quedaba
-- colgada en pending_payment con el stock reservado. Con esta versión el
-- camino de error cierra limpio y libera el cupo.
--
-- Backwards-compatible: toda fila existente lo satisface (las órdenes de MP en
-- producción tienen preferencia; yape_manual y courtesy no cambian).
-- =============================================================

alter table public.orders drop constraint if exists orders_check;
alter table public.orders add constraint orders_check check (
  payment_method = 'yape_manual'::payment_method
  or payment_method = 'courtesy'::payment_method
  or (
    payment_method = 'mercadopago'::payment_method
    and (
      mp_preference_id is not null
      -- Ventana de checkout: la orden existe, todavía no se cobró.
      or (status not in ('paid'::order_status, 'refunded'::order_status)
          and mp_payment_id is null)
    )
  )
);
