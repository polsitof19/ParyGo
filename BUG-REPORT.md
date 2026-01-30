# REPORTE DE BUGS OCULTOS - ParyGo

Fecha: 2026-01-29

---

## BUG 1: Race condition en doble clic de botones de compra/canje

**Ubicacion:** `js/cliente.js:1437-1494` (`claimFreeTickets`), `js/cliente.js:1630-1689` (`sendPaymentProof`), `js/cliente.js:1343-1394` (`confirmRedeem`)

**Descripcion:** El boton se deshabilita al inicio pero el `finally` o el codigo posterior lo re-habilita SIEMPRE, incluso si la operacion fue exitosa. Si el usuario hace doble clic rapido antes de que `btn.disabled = true` tome efecto (el estado async aun no inicio), se pueden crear tickets/ventas duplicados.

**Como reproducirlo:**
1. Abrir modal de entrada gratuita
2. Hacer clic rapido 2+ veces en "OBTENER ENTRADAS"
3. Se generan entradas duplicadas porque no hay un flag mutex global

**Ejemplo concreto en `claimFreeTickets` (linea 1437):**
```javascript
// btn.disabled = true en linea 1444
// Pero el loop crea tickets secuencialmente (await en for)
// Si se ejecuta 2 veces en paralelo, se duplican
```

**Sugerencia:** Agregar un flag booleano global (`isProcessing`) que se verifique al inicio de cada funcion critica y se limpie al final.

---

## BUG 2: Boton de registro NO se re-habilita en flujo exitoso

**Ubicacion:** `js/cliente.js:772-817` (`handleRegister`)

**Descripcion:** Si `createUserWithEmailAndPassword` tiene exito (linea 778), el boton `btnRegister` queda con `disabled = true` y texto "CREANDO CUENTA..." permanentemente. Solo se re-habilita en el catch (linea 814). El `onAuthStateChanged` redirige, pero si hay un error creando el documento en `clientes` (linea 781) DESPUES de crear el Auth user, el boton queda bloqueado.

**Como reproducirlo:**
1. Intentar registrarse
2. Auth crea el usuario exitosamente
3. Firestore falla al crear documento (ej: reglas de seguridad, red)
4. El error llega al catch, el boton se re-habilita, pero ahora hay un usuario Auth sin documento en `clientes`
5. El `onAuthStateChanged` detecta al usuario, intenta cargar perfil, falla, y hace signOut

**Sugerencia:** Envolver la creacion del documento `clientes` en su propio try/catch y manejar el caso de auth creado pero documento fallido.

---

## BUG 3: `handleCheckDNI` no re-habilita boton al buscar en RENIEC

**Ubicacion:** `js/cliente.js:646-696` (`handleCheckDNI`)

**Descripcion:** Si `searchRENIECForRegistration` tiene exito o falla, el boton `btnCheckDNI` nunca recupera su estado original en el flujo exitoso. Solo se re-habilita en el catch (linea 693) o si el DNI ya existe (linea 672). En el flujo normal (lineas 680-688), el boton queda deshabilitado con spinner.

**Como reproducirlo:**
1. Ingresar un DNI nuevo
2. Hacer clic en "SIGUIENTE"
3. El sistema avanza al paso 2
4. Volver al paso 1 con `backToRegStep1()` (que SI re-habilita, linea 726)
5. Si el usuario NO usa `backToRegStep1` y el flujo falla silenciosamente, el boton queda bloqueado

**Sugerencia:** Agregar `finally` para siempre re-habilitar el boton.

---

## BUG 4: Colision de ID en `setDoc` para clientes multi-marca

**Ubicacion:** `js/cliente.js:781` y `js/cliente.js:421`

**Descripcion:** Al registrar un cliente, se usa `setDoc(doc(db, "clientes", cred.user.uid))` con el UID como ID del documento. Si el mismo usuario se registra en DOS marcas diferentes, el segundo `setDoc` **SOBREESCRIBE** el documento del primer registro porque usa el mismo UID como document ID.

**Como reproducirlo:**
1. Registrarse en `marca-a.parygo.com` → crea `clientes/{uid}` con `brand_id: "marca-a"`
2. Registrarse en `marca-b.parygo.com` → SOBREESCRIBE `clientes/{uid}` con `brand_id: "marca-b"`
3. El perfil de marca-a se pierde

El mismo bug existe en `linkAccountToProfile` (linea 421).

**Sugerencia:** Usar un ID compuesto como `{uid}_{brandId}` o una subcoleccion.

---

## BUG 5: `loadUserProfile` falla para multi-marca por ID de documento

**Ubicacion:** `js/cliente.js:267-301` (`loadUserProfile`)

**Descripcion:** `loadUserProfile` primero busca por `doc(db, "clientes", uid)` (linea 270), y luego verifica `data.brand_id === currentBrandId` (linea 275). Si el BUG 4 ya ocurrio y se sobreescribio el documento con otra marca, el usuario no podra entrar a la primera marca nunca mas.

El fallback query (linea 283-288) busca por `uid` + `brand_id`, pero si el documento original fue sobreescrito, no existira un match.

---

## BUG 6: Token RENIEC expuesto y uso de proxy CORS de terceros

**Ubicacion:** `js/cliente.js:395-396`, `js/cliente.js:558-559`, `js/cliente.js:700-701`, `reclamar.js:290`

**Descripcion:**
1. El token JWT de apisPeru esta hardcodeado en el frontend (visible para cualquier usuario)
2. Se usa `corsproxy.io` como proxy CORS, un servicio de terceros que puede interceptar/modificar la respuesta
3. Si `corsproxy.io` cae o cambia, la busqueda RENIEC deja de funcionar silenciosamente

**Como reproducirlo:** Abrir DevTools > Network y ver la peticion con el token completo en la URL.

---

## BUG 7: XSS potencial en `showError` y `updateBrandUI`

**Ubicacion:** `js/cliente.js:247-253` (`showError`), `js/cliente.js:211` (`updateBrandUI`)

**Descripcion:**
- `showError` usa template literal directo: `<p>${message}</p>` sin escapar. Si `message` proviene de datos no confiables (ej: el slug de la marca), podria inyectar HTML.
- `updateBrandUI` usa `<img src="${currentBrand.logo}">` sin escapar. Si el logo en Firestore contiene `" onerror="alert(1)"`, se ejecutaria JS.

**Como reproducirlo:**
1. Crear una marca en Firestore con `logo: '" onerror="alert(document.cookie)"'`
2. Acceder al subdominio de esa marca
3. Se ejecuta JavaScript arbitrario

---

## BUG 8: QR del carrusel no se limpia al reabrir

**Ubicacion:** `js/cliente.js:2008-2026` (`renderCarousel`)

**Descripcion:** Al abrir el carrusel, se generan nuevos QRs con `new QRCode(container, ...)` pero no se limpia el contenido previo del container. Si el usuario abre el mismo grupo de entradas multiples veces, los QR se acumulan dentro de cada `#carouselQR_N`.

**Como reproducirlo:**
1. Abrir "Mis Entradas"
2. Clic en un grupo con varias entradas
3. Volver atras
4. Volver a abrir el mismo grupo
5. Los contenedores QR ahora tienen QR duplicados

**Sugerencia:** Limpiar el contenido de cada container antes de generar: `container.innerHTML = ''` antes de `new QRCode(...)`.

---

## BUG 9: Eventos sin fecha excluidos de "Mis Entradas"

**Ubicacion:** `js/cliente.js:1803-1811` (`renderMyTickets`)

**Descripcion:** Los filtros de "Proximos" y "Pasados" requieren `t.event_date`. Si un ticket no tiene `event_date`, no aparece en NINGUNA de las dos tabs (upstream ni pasados). Solo apareceria si su status es `SCANNED`/`USED` (en "Pasados").

**Como reproducirlo:**
1. Crear un evento sin fecha
2. Generar un ticket para ese evento
3. El ticket ACTIVE sin fecha no aparece en "Proximos" ni "Pasados"

---

## BUG 10: `confirmRedeem` no valida estado actual del codigo

**Ubicacion:** `js/cliente.js:1343-1394` (`confirmRedeem`)

**Descripcion:** Entre que el usuario valida el codigo (`redeemCode`, linea 1315: verifica `status === 'FREE'`) y confirma el canje (`confirmRedeem`), otro usuario podria haber canjeado el mismo codigo. No hay re-validacion ni transaccion atomica.

**Como reproducirlo:**
1. Usuario A valida codigo "ABC123" → status: FREE → muestra modal
2. Usuario B valida el mismo codigo "ABC123" → status: FREE → muestra modal
3. Usuario A confirma → actualiza status a CLAIMED
4. Usuario B confirma → actualiza status a CLAIMED nuevamente (sobreescribe claimed_by)
5. Ahora hay 2 tickets pero el codigo solo muestra los datos del ultimo

**Sugerencia:** Usar `runTransaction` para verificar y actualizar atomicamente.

---

## BUG 11: Pull-to-refresh no tiene debounce

**Ubicacion:** `js/cliente.js:2478-2513` (`setupPullToRefresh`)

**Descripcion:** Si el usuario hace pull-to-refresh multiples veces rapido, `loadEvents()` y `loadMyTickets()` se ejecutan en paralelo multiple veces sin cancelacion, generando peticiones Firebase innecesarias y potencial flickering de UI.

---

## BUG 12: Event listeners no se limpian en carrusel

**Ubicacion:** `js/cliente.js:2029-2030`

**Descripcion:** Se hace `track.removeEventListener('scroll', handleCarouselScroll)` antes de agregar el nuevo listener, lo cual es correcto. Sin embargo, los listeners de `touchstart`, `touchmove`, `touchend` del pull-to-refresh (lineas 2486-2512) se agregan en `setupPullToRefresh()` que se llama una vez, asi que esos estan bien. Pero si `setupEventListeners` se llama mas de una vez (ej: por un re-render), los listeners de keypress (lineas 2843-2862) se duplicarian.

---

## BUG 13: `auth_step1`, `auth_step2`, `auth_step3` no existen en el HTML

**Ubicacion:** `js/cliente.js:310-312` (`showLinkAccountPrompt`), `js/cliente.js:585-590` (`showAuthStep`)

**Descripcion:** Las funciones `showLinkAccountPrompt` y `showAuthStep` intentan ocultar `auth_step1`, `auth_step2`, `auth_step3`, pero en `cliente.html` estos IDs NO existen. El HTML usa `loginScreen` y `registerScreen` con `reg_step1` y `reg_step2`. Los `?.classList` evitan el crash pero la logica de navegacion no funciona correctamente para el flujo de vinculacion de cuenta.

**Como reproducirlo:**
1. Tener una cuenta en otra marca pero no en la actual
2. El sistema deberia mostrar el prompt de vinculacion
3. Los pasos auth_step1/2/3 nunca se ocultan porque no existen

---

## BUG 14: Entradas gratuitas no validan stock

**Ubicacion:** `js/cliente.js:1437-1494` (`claimFreeTickets`)

**Descripcion:** Al obtener entradas gratuitas, no se verifica el stock disponible del tipo de entrada (`ticketType.stock`). Un usuario podria solicitar 10 entradas de un tipo que solo tiene 2 de stock.

**Como reproducirlo:**
1. Crear tipo de entrada gratuita con stock: 2
2. Un cliente solicita 10 entradas de ese tipo
3. Se crean 10 tickets sin restriccion

---

## BUG 15: `sendPaymentProof` guarda imagen como base64 en Firestore

**Ubicacion:** `js/cliente.js:1646-1674`

**Descripcion:** El comprobante de pago se convierte a base64 con `fileToBase64()` y se guarda en dos campos del mismo documento (`proof_image` y `payment_proof`). Una imagen de celular puede pesar 2-5MB en base64, excediendo el limite de Firestore de 1MB por documento, causando un error silencioso.

**Como reproducirlo:**
1. Tomar una foto de alta resolucion como comprobante
2. Subir la imagen
3. Firestore rechaza el documento por exceder 1MB
4. El catch muestra "Error al enviar comprobante" sin indicar la causa real

---

## RESUMEN

| # | Severidad | Bug | Ubicacion |
|---|-----------|-----|-----------|
| 1 | ALTA | Race condition doble clic | cliente.js:1437,1630,1343 |
| 2 | MEDIA | Boton registro no se re-habilita | cliente.js:772 |
| 3 | BAJA | Boton DNI no se re-habilita | cliente.js:646 |
| 4 | CRITICA | setDoc sobreescribe multi-marca | cliente.js:781,421 |
| 5 | CRITICA | Perfil multi-marca roto | cliente.js:267 |
| 6 | ALTA | Token API expuesto + proxy CORS | cliente.js:395,558,700 |
| 7 | ALTA | XSS en showError y logo | cliente.js:247,211 |
| 8 | BAJA | QR duplicados en carrusel | cliente.js:2008 |
| 9 | MEDIA | Tickets sin fecha invisibles | cliente.js:1803 |
| 10 | ALTA | Race condition en canje de codigo | cliente.js:1343 |
| 11 | BAJA | Pull-to-refresh sin debounce | cliente.js:2478 |
| 12 | BAJA | Listeners duplicados potencial | cliente.js:2843 |
| 13 | MEDIA | IDs auth_step inexistentes | cliente.js:310 |
| 14 | ALTA | Sin validacion de stock | cliente.js:1437 |
| 15 | ALTA | Base64 excede limite Firestore | cliente.js:1646 |
