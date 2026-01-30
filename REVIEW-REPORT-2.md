# REPORTE DE PRUEBA DE FLUJOS CRITICOS - ParyGo

## 1. FLUJO DE COMPRA

**Resultado: ✅ Funciona correctamente**

Archivos analizados: `js/cliente.js:1499-1689`, `cliente.html:472-672`

**Lo que funciona:**
- Cliente ve evento y tipos de entrada disponibles
- Selecciona cantidad (1-10) con selector +/- (`changeQty`, linea 1518)
- Elige metodo de pago: Yape, Plin o Transferencia (`selectPaymentMethod`, linea 1552)
- Carga datos de pago dinamicamente desde `payment_config` del evento (linea 1558)
- Sube comprobante como imagen base64 (`sendPaymentProof`, linea 1630)
- Se crea documento en coleccion `sales` con status `PENDING` (linea 1675)
- Flujo de 4 pasos bien implementado (cantidad > metodo > comprobante > confirmacion)

**Observaciones menores:**
- El total no incluye comision adicional, aunque el HTML muestra "S/. 50.37" como ejemplo en el paso 1, el calculo real en `updateBuyTotal` (linea 1524) es simplemente `subtotal = qty * unitPrice` sin margen. Esto esta correcto si no hay comision.
- La imagen del comprobante se guarda como base64 directamente en Firestore (linea 1658 y 1674), lo que puede exceder el limite de 1MB por documento si la imagen es grande.

---

## 2. FLUJO DE APROBACION

**Resultado: ✅ Funciona correctamente**

Archivos analizados: `js/metrics.js:462-590`

**Lo que funciona:**
- Admin ve ventas pendientes con filtro por estado (`renderSalesCards`, linea 306)
- Abre modal de aprobacion con datos del cliente (`approveSale`, linea 462)
- Confirma con transaccion atomica de Firestore (`confirmApproveSale`, linea 509)
- Se crean tickets por cada unidad comprada en un loop `for (let i = 0; i < quantity; i++)` (linea 536)
- Tickets se crean con status `'ACTIVE'` (linea 561), no `'redeemed'` como sugiere el enunciado
- Venta se marca como `APPROVED` (linea 530)
- Soporta aprobacion masiva (`approveSelectedSales`, linea 273)

**Observacion importante:**
- Los tickets creados tienen status `'ACTIVE'`, no `'redeemed'`. Esto es **correcto** segun el flujo actual del sistema, ya que `ACTIVE` es el estado que permite al scanner validar la entrada. El status `redeemed` no se usa en este codebase.

---

## 3. FLUJO DE ENTRADAS (Mis Entradas)

**Resultado: ✅ Funciona correctamente**

Archivos analizados: `js/cliente.js:1703-1962`

**Lo que funciona:**
- `loadMyTickets` (linea 1703) carga tickets del usuario filtrados por `brand_id`
- Carga tambien compras pendientes separadamente (linea 1721)
- Entradas agrupadas por evento y sub-agrupadas por tipo (`renderMyTickets`, linea 1773)
- Sistema de tabs: Proximos, Pasados, Pendientes con contadores (linea 1753)
- Carrusel funcional con swipe para multiples entradas del mismo tipo (`_openCarousel`, linea 1931)
- Si solo hay 1 entrada, va directo a vista QR individual (linea 1936)
- QR se genera con `qr_data` almacenado en el ticket
- Botones de Compartir y Descargar presentes en la vista

**Observaciones:**
- La clasificacion upcoming/past se basa en `event_date` (linea 1804), si un evento no tiene fecha se excluye de ambas tabs.

---

## 4. FLUJO DE CANJE (Codigo de promotor)

**Resultado: ✅ Funciona correctamente**

Archivos analizados: `js/cliente.js:1291-1408` y `reclamar.js:1-804`

**Lo que funciona en `cliente.js` (desde detalle del evento):**
- Cliente ingresa codigo de 6+ caracteres (linea 1295)
- Busca en coleccion `codes` por `code` + `event_id` (linea 1301)
- Valida que status sea `'FREE'` (linea 1315)
- Muestra modal de confirmacion con datos del evento (linea 1327)
- Al confirmar: actualiza codigo a `CLAIMED` y crea ticket `ACTIVE` (linea 1353-1380)
- El ticket aparece en "Mis Entradas" via `loadMyTickets()` (linea 1388)

**Lo que funciona en `reclamar.js` (pagina independiente):**
- Flujo de 4 pasos: codigo > DNI > datos > ticket con QR
- Busca por `code` o `qr_token` en coleccion `tickets` (linea 161-183)
- Valida marca, usos, expiracion, estado del evento (lineas 185-250)
- Soporta codigos UNIQUE y SHARED (linea 193-208)
- Genera QR con token unico (linea 361)
- Descarga ticket como imagen PNG (linea 521)

**Observacion:**
- Son dos flujos de canje **separados**: uno dentro del portal cliente (busca en `codes`) y otro en `reclamar.html` (busca en `tickets`). Usan colecciones diferentes y logica distinta, lo cual puede generar confusion si no se documentan bien las diferencias.

---

## 5. FLUJO DE ESCANEO

**Resultado: ✅ Funciona correctamente**

Archivo analizado: `scanner.js:1-874`

**Lo que funciona:**
- Login con validacion de rol `scanner` y status `ACTIVE` (linea 62)
- Carga solo eventos activos de marcas asignadas (linea 201)
- Scanner QR con Html5Qrcode, fps:10, qrbox:250x250 (linea 406)
- Busqueda multiple: por `code`, `qr_token`, `client_dni`, `claimed_by.dni` (lineas 491-526)
- **Doble escaneo protegido**: verifica `status.includes('SCANNED')` (linea 556) y muestra "Ya Escaneado" con timestamp
- Verifica entradas canceladas (linea 572) y expiradas (linea 583)
- Verifica que la entrada haya sido reclamada (linea 600)
- Aprobacion manual: scanner ve datos y aprueba o rechaza (linea 676-695)
- Al aprobar, se marca como `SCANNED` con timestamp y scanner_id (linea 704)
- Estadisticas en tiempo real: exitosos, duplicados, total (linea 795)
- Historial de escaneos con limite de 50 (linea 749)
- Feedback audible y haptico: beep + vibracion (lineas 450-455, 843-868)

**Observacion:**
- El rechazar entrada (`rejectEntry`, linea 725) solo cierra el modal sin actualizar Firestore. El ticket sigue en estado valido, lo cual es correcto (el scanner simplemente no deja pasar pero no invalida la entrada).

---

## RESUMEN EJECUTIVO

| Flujo | Estado | Notas |
|-------|--------|-------|
| Compra | ✅ | Imagen base64 puede exceder limite Firestore |
| Aprobacion | ✅ | Tickets creados con status ACTIVE (correcto) |
| Mis Entradas | ✅ | Agrupacion, carrusel y QR funcionan |
| Canje | ✅ | Dos flujos separados (cliente.js vs reclamar.js) |
| Escaneo | ✅ | Proteccion contra doble uso funcional |

**Problemas transversales detectados:**
1. **Token API expuesto** en `reclamar.js:290` - el token de RENIEC/apisPeru esta hardcodeado en frontend
2. **Imagenes base64 en Firestore** - tanto el comprobante de pago como el flyer del evento se guardan como base64, lo cual puede causar documentos muy grandes
3. **Sin validacion server-side** - toda la logica de validacion es client-side, un usuario tecnico podria manipular datos directamente en Firestore
