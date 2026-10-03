# AGENTS.md — PayPal para las entradas (cobro automático con la cuenta de la marca)

Plan del 2026-10-03 (roadmap acordado con Paul: "avanza"). Planes anteriores:
docs/vender-fuera-de-peru.md (hecho) y docs/conectar-mp.md (tarea 7 espera el
Client ID/Secret de MP de Paul).

## Objetivo
Una marca que vende en dólares, euros o pesos mexicanos cobra sus entradas con
PayPal (con su cuenta PayPal o con tarjeta como invitado) y la entrada sale
SOLA, sin comprobante ni aprobación. La plata va directo a la cuenta PayPal de
la marca; ParyGo sigue sin tocarla.

## Decisiones
1. **Credenciales REST de la marca** (Client ID + Secret de una app Live de
   developer.paypal.com), pegadas en Mi marca con una guía paso a paso.
   "Connect with PayPal" (onboarding de partner) exige que PayPal apruebe a
   ParyGo como partner: fuera de alcance. Cuando exista, reemplaza el pegado
   como OAuth reemplazó las claves manuales de MP.
2. **Monedas: USD, EUR, MXN.** PayPal no opera PEN, COP, CLP ni ARS. En otra
   moneda Mi marca lo muestra apagado ("solo para marcas que venden en
   dólares, euros o pesos mexicanos") y startCheckout lo rechaza.
3. **Conectar** (conectarPaypalAction, solo la dueña real como MP —duenaRealDe):
   pide un token a PayPal con el par (un par inválido NO se guarda), registra
   el webhook de esa app (POST /v1/notifications/webhooks, url
   `<APP_URL>/api/webhooks/paypal/<brandId>`, eventos PAYMENT.CAPTURE.COMPLETED,
   REFUNDED, REVERSED) y guarda con set_brand_paypal: client_id en claro (no es
   secreto: va en el JS de cualquier tienda) con ÍNDICE ÚNICO (una app = una
   marca), secret cifrado pgp_sym con BRAND_CREDS_ENCRYPTION_KEY (como 0034/0086),
   webhook_id. Sandbox SOLO en marcas is_test (CHECK): lo usa el E2E.
4. **Crear el pago**: startCheckout(method 'paypal') → orden pending_payment,
   payment_method 'paypal' → orden de PayPal con el token de la marca:
   intent CAPTURE, monto = orders.total_cents RELEÍDO de la orden (como MP),
   `(cents/100).toFixed(2)` (las 3 monedas tienen 2 decimales), currency =
   brands.moneda releída, custom_id = invoice_id = order.id (PayPal rechaza un
   invoice_id repetido: la misma orden no se cobra dos veces), return_url = la
   confirmación de la orden en el host del pedido, cancel_url = el evento con
   ?pago=cancelado, NO_SHIPPING, PAY_NOW. Se guarda orders.paypal_order_id y el
   comprador va al link de aprobación. Si PayPal falla: orden failed + libera
   cupo y promo (igual que MP).
5. **La plata se mueve al CAPTURAR y solo captura el server.** Confirmación:
   orden paypal, no pagada, `?token` == orders.paypal_order_id → candado
   `pp_vuelta:<orden>` 10 s → capture (PayPal-Request-Id `cobrar-<ordenPayPal>`;
   ORDER_ALREADY_CAPTURED → se lee la orden) → la captura COMPLETED tiene que
   tener custom_id == la orden → settle_paypal_payment. Si el comprador no
   vuelve, no se cobra nada y la reserva vence sola. Rechazo de PayPal →
   orden failed, libera cupo y promo, pantalla "PayPal no aprobó el pago" con
   volver a intentar (otra orden).
   **Antes de capturar** (Codex, alta): `puede_cobrar_paypal(orden, marca)`
   bajo FOR UPDATE de la orden: status cobrable y `_order_capacity_overflow`
   ok (el gate de settle mide `sold`, no las reservas: es el mismo cálculo).
   Si no hay cupo NO se captura (sin cargo) y se muestra "se agotaron".
   **Captura que no emite** (quedó una ventana de segundos con otra venta
   simultánea, o monto/moneda que no calzan): se DEVUELVE sola con
   POST /v2/payments/captures/{id}/refund (PayPal-Request-Id
   `devolver-<captura>`), la orden pasa a refunded con la captura anotada y
   queda en events_log `paypal_auto_refund`; el comprador ve "te devolvimos el
   pago". Si la devolución falla, events_log `paypal_refund_pendiente` (sale en
   Salud) para hacerla a mano.
   **Credenciales atadas a la orden** (Codex, alta): orders.paypal_client_id =
   el client_id con que se creó la orden de PayPal. Se captura SOLO si la
   marca sigue con ese mismo client_id; si cambió, no se captura (PayPal no
   mueve plata sin captura) y el comprador vuelve a empezar.
6. **settle_paypal_payment(orden, marca, capture_id, paid_cents, moneda)**: el
   mismo esqueleto que settle_mp_payment (FOR UPDATE de la orden de esa marca,
   idempotencia por tickets, solo pending_payment/failed/expired/paid-sin-
   tickets, nunca refunded; monto == total congelado; moneda == brands.moneda;
   gate de cupo → oversold_no_capacity; promo re-tomada y consumida; emisión;
   libera reservas). capture_id con índice único; un segundo capture_id de una
   orden ya emitida → events_log paypal_duplicate_capture, sin emitir.
7. **Webhook /api/webhooks/paypal/[brandId]**: el cuerpo NO se cree. PRIMERO
   la base (Codex, media: sin esto un id inventado gastaba la API de la
   marca): COMPLETED solo si `supplementary_data.related_ids.order_id` es el
   paypal_order_id de una orden de ESA marca sin pagar; REFUNDED/REVERSED solo
   si el id es el paypal_capture_id de una orden de esa marca. Lo que no está
   en la base → 200 sin llamar a nadie. Recién ahí se toma el
   id de la captura del aviso y se RE-PIDE (GET /v2/payments/captures/{id}) con
   el token de la marca de la URL; custom_id tiene que ser una orden de ESA
   marca. COMPLETED → settle (respaldo de una vuelta que no llegó). REFUNDED
   (total) o REVERSED → refund_paypal_order (refunded + entradas ANULADAS en la
   misma transacción, solo si capture_id == orders.paypal_capture_id; como
   0084). PARTIALLY_REFUNDED no anula (misma decisión que MP). Candado por
   captura. 200 a lo que no es nuestro; 5xx solo si falla PayPal o la base
   (PayPal reintenta 25 veces en 3 días). Sin verificación de firma (el aviso
   solo dispara una relectura de un dato real; anotado para revisión).
8. **Desconectar / cambiar credenciales**: bloqueado con un pago PayPal activo
   (pending_payment con paypal_order_id de < 30 min), como MP (la carrera que
   queda la cierra el client_id atado a la orden, decisión 5). Desconectar
   borra el webhook en PayPal (best effort) y las columnas. Riesgo aceptado:
   una devolución hecha en PayPal sobre un cobro de una app ANTERIOR ya no
   llega (no quedan sus credenciales para releerla).
   **Cuenta de quién** (Codex, media → mejora): un par válido no prueba que
   la cuenta sea de la marca; es el mismo caso que escribir otro número de
   Yape (riesgo aceptado en 0088). Se registra en events_log y en la
   auditoría del super admin (client_id con los últimos 4), sin más pasos.
9. **"Tiene método"** (publicar un evento que cobra): suma PayPal conectado en
   una moneda que PayPal acepta (lib/metodoPago.ts).
10. **Comprador**: una opción más, "PayPal o tarjeta", junto al medio manual.
    Con PEN no aparece (y la Tarjeta de MP solo existe en PEN: nunca coinciden).
    Si la marca solo tiene PayPal, es el método por defecto.

## Modelo de datos
- 0090: `alter type payment_method add value 'paypal'` (sola: un valor nuevo de
  enum no se puede usar en la misma transacción que lo crea).
- 0091:
  - brands: paypal_client_id text (único parcial), paypal_secret_enc bytea,
    paypal_webhook_id text, paypal_sandbox boolean not null default false
    (check: not paypal_sandbox or is_test), paypal_conectado_at timestamptz.
    SIN grant a anon/authenticated (nada de esto se lee desde el navegador).
  - orders: paypal_order_id text (único parcial), paypal_client_id text,
    paypal_capture_id text (único parcial).
    orders_check: una orden paypal paid/refunded exige paypal_capture_id.
  - RPCs service-role-only (revoke LITERAL de public, anon, authenticated):
    set_brand_paypal, get_brand_paypal_credentials, clear_brand_paypal,
    puede_cobrar_paypal, settle_paypal_payment, refund_paypal_order
    (también para la devolución automática: acepta una orden no emitida con
    la captura que se devolvió).

## Archivos
- lib/paypalApi.ts (nuevo): fetch a PayPal con credenciales recibidas (token,
  crearOrden, capturar, leerCaptura, crearWebhook, borrarWebhook) y
  montoPaypal(cents) / centsDePaypal(value) por texto, sin floats.
  lib/cobroParygo.ts (packs) pasa a usarla con las claves de Paul: mismo
  comportamiento.
- lib/paypalMarca.ts (nuevo): credenciales de la marca, paypalUsable,
  liquidarPagoPaypal (lo usan confirmación y webhook).
- app/admin/settings: sección "PayPal (cuenta PayPal y tarjeta)" + acciones.
- app/b/[brand]/[event]/actions.ts (startCheckout), EventCheckoutPanel.tsx,
  page.tsx (si se ofrece), confirmacion/page.tsx (captura).
- app/api/webhooks/paypal/[brandId]/route.ts (nuevo).
- database.types.ts a mano (no regenerar entero).

## Tareas
- [ ] 1. 0090 + 0091: dryrun, aplicar, verificar. e2e/paypal-0091.mjs: JWT anon
  y dueño NO leen paypal_* ni ejecutan las RPCs; settle: monto distinto,
  moneda distinta, otra marca, idempotencia, 2 settles simultáneos → 1 emite,
  capture_id de otra orden rechazado, refund anula, parcial no; sandbox en
  marca no-test rechazado. **Listo**: todo verde y demotest intacta.
- [ ] 2. lib/paypalApi.ts + refactor de cobroParygo.ts. e2e/paypal-api.test.mts
  con fetch interceptado: cuerpo de la orden (monto por texto, moneda,
  custom_id, invoice_id), capturar con ALREADY_CAPTURED, rechazo, custom_id
  ajeno, montos 0.01/19.99/1234.50. **Listo**: test verde, tsc, empezar-paypal
  (packs) sin cambios de comportamiento.
- [ ] 3. Mi marca: conectar/desconectar + guía; bloqueo con pago activo;
  metodoPago cuenta PayPal. **Listo**: tsc, capturas 390/1440, publicar-metodo.
- [ ] 4. Checkout + confirmación + webhook. **Listo**: tsc; fase1 sin cambios
  (Yape idéntico); prueba de la vuelta y del webhook con fetch interceptado.
- [ ] 5. Security review + Codex; E2E punta a punta con PayPal SANDBOX en una
  marca is_test (pendiente de las credenciales sandbox de Paul); deploy.

## Fuera de alcance
- "Connect with PayPal" (partner). PayPal en soles/COP/CLP/ARS (conversión).
- Reembolso parcial que anule entradas; Pay Later; suscripciones.
- Verificación de firma del webhook (ver decisión 7).

## Bloqueos
- E2E real necesita una app SANDBOX de PayPal (Client ID + Secret, gratis en
  developer.paypal.com → Apps & Credentials → Sandbox). Pedírsela a Paul.
