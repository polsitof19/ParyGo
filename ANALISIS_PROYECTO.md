# 🔍 Análisis de Seguridad y Código - ParyGo

> **Fecha:** 27 de Enero 2026
> **Rama analizada:** `claude/spanish-greeting-ishz6`
> **Archivos analizados:** 30+ archivos (JS, HTML, CSS)

---

## 1. 🔐 SEGURIDAD

### 🔴 Crítico - API Keys y tokens expuestos

| Archivo | Línea | Problema |
|---------|-------|----------|
| `js/config.js` | 13-18 | Firebase API key hardcodeada (aceptable para Firebase pero requiere Firestore Security Rules estrictas) |
| `js/config.js` | 38 | **APIS_PERU_TOKEN** (JWT completo) expuesto en frontend. Cualquiera puede usarlo para consultar DNI en RENIEC |
| `scanner.js` | 26-33 | Firebase config duplicada (mismo problema, doble mantenimiento) |

**Recomendación:** Mover `APIS_PERU_TOKEN` a un backend/proxy. El token JWT permite consultas ilimitadas a la API de DNI del Perú.

---

### 🔴 Crítico - Control de acceso solo del lado del cliente

| Archivo | Línea | Problema |
|---------|-------|----------|
| `js/events.js` | 29-48 | Filtro de eventos por marca se hace **solo en JavaScript**. Un usuario puede saltarse el filtro desde la consola del navegador |
| `js/brands.js` | 30-40 | La detección de "super admin" tiene 4 condiciones diferentes que podrían llevar a escalación de privilegios |
| `js/auth.js` | 167-171 | Bloqueo de promotor accediendo al panel admin es solo client-side |

**Recomendación:** Las reglas de Firestore (`firestore.rules`) **deben** validar permisos server-side. No hay archivo de reglas en el repositorio, lo que significa que no se puede verificar si están configuradas.

---

### 🔴 Crítico - No existe archivo de Firestore Security Rules

**No se encontró ningún archivo `firestore.rules` o `firestore.indexes.json` en el proyecto.** Esto significa:
- No hay forma de verificar que los datos estén protegidos server-side
- Si las reglas están en modo "test" (`allow read, write: if true`), **TODA la base de datos es pública**
- Cualquier persona con la Firebase config puede leer/escribir datos directamente

---

### 🟡 Importante - Vulnerabilidades XSS

| Archivo | Línea | Problema |
|---------|-------|----------|
| `js/codes.js` | 82-87 | Uso de `onclick` en template strings con datos interpolados. Un nombre de promotor malicioso podría inyectar código |
| `js/staff.js` | 99-100 | Mismo patrón de onclick inline con datos sin escapar adecuadamente |
| `scanner.js` | 265 | `event.image` se usa en `src` de img. Debería validarse que sea una URL válida, no solo HTML-escaped |
| `js/logic.js` | 215-219 | HTML de rewards generado con template strings |

**Recomendación:** Reemplazar todos los `onclick` inline con `addEventListener`. Usar `textContent` en vez de `innerHTML` donde sea posible.

---

### 🟡 Importante - Datos sensibles en localStorage

| Archivo | Línea | Problema |
|---------|-------|----------|
| `js/auth.js` | 227-235 | Se almacena `is_super_admin`, `role`, `uid`, `email` en localStorage. Un usuario puede modificar `is_super_admin: true` desde la consola |

**Recomendación:** Nunca almacenar flags de permisos en localStorage. Solo almacenar tokens de sesión.

---

### 🟡 Importante - Sin rate limiting

| Archivo | Línea | Problema |
|---------|-------|----------|
| `scanner.js` | 462-479 | El scanner tiene cooldown de solo 2 segundos. Podrían hacerse 30 requests/minuto a Firestore |
| `js/dni-api.js` | 22 | Consultas a API de DNI sin límite de velocidad |

---

### 🟢 Menor - Validaciones faltantes en formularios

| Archivo | Línea | Problema |
|---------|-------|----------|
| `js/dni-api.js` | 22 | Parámetro DNI no se codifica con `encodeURIComponent()` en la URL |
| `scanner.js` | Input manual | Acepta cualquier string sin validación de formato antes de consultar Firebase |

---

## 2. 🔑 AUTENTICACIÓN

### 🟡 Importante - Validación de roles

| Archivo | Línea | Problema |
|---------|-------|----------|
| `js/auth.js` | 167-171 | El bloqueo de promotor en panel admin es client-side. Un promotor que modifique el JS podría acceder |
| `js/brands.js` | 30-40 | Lógica de "god mode" con 4 condiciones diferentes: `isSuperAdmin`, `role === 'super_admin'`, `collection === 'empresa'`, `admin sin brands`. Inconsistente |
| `js/logic.js` | 308-312 | Los botones de navegación (eventos, promotores, admins) no verifican permisos antes de cargar la vista |

### 🟡 Importante - Acceso a rutas sin login

| Portal | Estado |
|--------|--------|
| `index.html` (Admin) | ✅ Valida auth con `checkAuth()` |
| `scanner.html` | ✅ Valida auth y rol scanner |
| `promotor.html` | ✅ Valida auth y rol promoter |
| `cliente.html` | ⚠️ Necesita verificar que valide correctamente |
| `reclamar.html` | ⚠️ Página pública de reclamar - verificar que no exponga datos sensibles |
| `create-admin.html` | 🔴 **Verificar si tiene protección de acceso** |
| `migrate-admin.html` | 🔴 **Verificar si tiene protección de acceso** |

### 🟡 Importante - Sesión

| Archivo | Línea | Problema |
|---------|-------|----------|
| `js/auth.js` | 227 | La sesión en localStorage no tiene expiración. Un token robado funciona indefinidamente |
| `js/auth.js` | 273-275 | `onAuthStateChanged` se desuscribe inmediatamente dentro del callback, pero las operaciones async siguen pendientes |

---

## 3. 💻 CÓDIGO

### 🔴 Crítico - Funciones duplicadas

| Función | Archivos | Problema |
|---------|----------|----------|
| Firebase Config | `js/config.js`, `scanner.js` | Config copiada en 2 archivos. Si cambia una key, hay que cambiarla en ambos |
| Validación DNI | `js/dni-api.js:12`, `js/utils.js:18-21` | Dos implementaciones de validación de DNI |
| Validación Email | `js/utils.js:10-13`, `js/register.js:163-166` | Regex diferentes para validar email |
| `escapeHtml()` | `scanner.js`, `js/utils.js` | Función duplicada |

### 🟡 Importante - Código muerto

| Archivo | Línea | Problema |
|---------|-------|----------|
| `js/logic.js` | 732-738 | `loadAllSales()` declarada pero nunca llamada. Variable `allSalesData` sin uso |
| `js/access.js` | Todo el archivo | Archivo completo que no se importa ni usa en ningún HTML. Contiene código duplicado de metrics.js |

### 🟡 Importante - Bug potencial

| Archivo | Línea | Problema |
|---------|-------|----------|
| `js/tickets.js` | 99 | Variable `tk` no definida en el scope. Causa error al editar ticket |

### 🟡 Importante - try/catch faltantes

| Archivo | Línea | Problema |
|---------|-------|----------|
| `js/api.js` | 115-176 | `ExportService.toCSV()` no tiene try/catch. Si `data[0]` es undefined, falla silenciosamente |
| `js/api.js` | 64-97 | `WhatsAppService.send()` sin manejo de error si `window.open` falla |
| `js/brands.js` | 206-248 | No tiene `finally` block para resetear estado de botón si hay error |

### 🟢 Menor - Console.logs en producción

**Se encontraron 100+ `console.log`/`console.error` en todo el proyecto.** Los más relevantes:

| Archivo | Cantidad | Ejemplo |
|---------|----------|---------|
| `js/config.js` | 1 | `console.log('🚀 ParyGo v2.0.0...')` |
| `js/auth.js` | 6+ | Logs de autenticación y datos de usuario |
| `js/events.js` | 4+ | Logs de carga de eventos |
| `js/brands.js` | 2+ | Logs de marcas |
| `js/staff.js` | 3+ | Logs de staff |
| `scanner.js` | 4+ | Logs de scanner |

**Recomendación:** Eliminar todos los `console.log` para producción. Solo mantener `console.error` en catch blocks.

---

## 4. ⚡ RENDIMIENTO

### 🟡 Importante - Consultas Firebase no optimizadas

| Archivo | Línea | Problema |
|---------|-------|----------|
| `scanner.js` | 508-543 | Búsqueda de ticket hace hasta **4 queries secuenciales** (por código, qr_token, client_dni, claimed_by.dni). Con 1000 escaneos = 4000 lecturas |
| `js/metrics.js` | 30-32 | Carga **TODOS** los tickets de un evento sin paginación. Un evento con 10,000+ tickets consumiría mucha memoria |
| `js/events.js` | 27 | `getDocs(collection(db, "events"))` carga **todos** los eventos, sin filtro de fecha ni paginación |

**Recomendación:**
- Scanner: Agregar un campo unificado `search_key` en tickets para buscar con una sola query
- Metrics: Implementar paginación con `limit()` y `startAfter()`
- Events: Filtrar por `status === 'ACTIVE'` directamente en la query de Firestore

### 🟡 Importante - Memory leaks

| Archivo | Línea | Problema |
|---------|-------|----------|
| `scanner.js` | 442-450 | `stopScanner()` detiene el scanner pero no libera `state.html5QrCode = null`. La cámara queda en memoria |
| `js/auth.js` | 273-275 | `onAuthStateChanged` listener se desuscribe dentro del callback pero operaciones async pueden seguir ejecutándose |

### 🟢 Menor - DOM manipulation ineficiente

| Archivo | Línea | Problema |
|---------|-------|----------|
| `js/codes.js` | 68-94 | Concatenación de strings en loop (`html += ...`). Mejor usar Array + `.join('')` |
| `js/events.js` | 357-382 | Procesamiento de imágenes sincrónico en main thread. Podría usar OffscreenCanvas |

---

## 5. 📋 MEJORAS SUGERIDAS (por prioridad)

### 🔴 Alta prioridad

1. **Agregar Firestore Security Rules** al repositorio y verificar que estén desplegadas
2. **Mover APIS_PERU_TOKEN** a un backend/proxy (Cloud Function)
3. **Corregir bug** en `js/tickets.js:99` (variable `tk` undefined)
4. **Eliminar `js/access.js`** (código muerto que no se usa)
5. **Consolidar Firebase config** en un solo archivo (importar en scanner.js)
6. **Agregar validación server-side** de roles en operaciones sensibles (crear/editar/eliminar)
7. **Verificar protección** de `create-admin.html` y `migrate-admin.html`

### 🟡 Media prioridad

8. **Reemplazar onclick inline** con `addEventListener` para prevenir XSS
9. **Quitar is_super_admin de localStorage** - solo guardar token
10. **Agregar expiración** a la sesión de localStorage
11. **Optimizar scanner** con campo unificado de búsqueda (1 query en vez de 4)
12. **Agregar paginación** en métricas para eventos grandes
13. **Consolidar validadores** (DNI, email) en un solo archivo
14. **Eliminar función muerta** `loadAllSales()` en `js/logic.js`

### 🟢 Baja prioridad

15. **Eliminar console.logs** de producción (100+)
16. **Agregar rate limiting** client-side para API de DNI
17. **Liberar cámara** correctamente en scanner (`state.html5QrCode = null`)
18. **Usar DocumentFragment** en vez de innerHTML para listas largas
19. **Agregar `encodeURIComponent`** en URLs de API de DNI
20. **Usar Web Worker** para procesamiento de imágenes grandes
21. **Agregar `finally`** blocks faltantes en operaciones async con botones

---

## 📊 Resumen

| Categoría | 🔴 Crítico | 🟡 Importante | 🟢 Menor |
|-----------|-----------|--------------|---------|
| Seguridad | 3 | 5 | 2 |
| Autenticación | 0 | 5 | 0 |
| Código | 2 | 4 | 1 |
| Rendimiento | 0 | 4 | 3 |
| **Total** | **5** | **18** | **6** |

---

> **Nota:** Este análisis se basa en el código del frontend. No se pudo verificar el estado de las Firestore Security Rules ni la configuración del backend de Firebase ya que no están incluidos en el repositorio.
