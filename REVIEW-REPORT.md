# Reporte Completo de Analisis - ParyGo

**Fecha:** 2026-01-29
**Archivos analizados:** 17 JS + 7 HTML + 5 CSS

---

## ERRORES CRITICOS (10)

### JavaScript

| # | Archivo | Descripcion |
|---|---------|-------------|
| 1 | `js/config.js:38` | **Token API expuesto** - `APIS_PERU_TOKEN` (JWT) visible en frontend. Cualquier usuario puede extraerlo. |
| 2 | `js/config.js:12` + `js/cliente.js:30` | **Firebase config duplicada** - Misma config copiada en dos archivos. |
| 3 | `js/logic.js:1` | **Import de archivo muerto** - Importa `access.js` que no existe. |
| 4 | `js/tickets.js:99` | **Variable `tk` no definida** - Referencia a variable inexistente. |
| 5 | `js/events.js:407-419` | **Bug logico: if anidados** - Las condiciones de tabs estan anidadas en vez de ser if-else separados. Solo la primera se ejecuta. |

### HTML

| # | Archivo | Descripcion |
|---|---------|-------------|
| 6 | `index.html:293` | **URL de imagen rota** - `<img src="https://ibb.co/WQcspwm alt="ParyGo"` - falta comilla de cierre y URL invalida. |
| 7 | `index.html:1161/1215` | **ID duplicado `nt_type`** - Aparece dos veces. JS solo alcanza el primero, rompiendo funcionalidad. |
| 8 | `index.html:1491` | **HTML mal cerrado** - `</body></html>` antes de modales y scripts que siguen despues. |
| 9 | `index.html:1546/1696` | **SheetJS cargado dos veces** - Libreria duplicada, request de red innecesario. |
| 10 | `public.html:267` | **API key hardcoded** - `Authorization: 'Bearer demo'` en produccion. |

---

## WARNINGS (15)

### JavaScript

| # | Archivo | Descripcion |
|---|---------|-------------|
| 11 | `js/utils.js:46+446` | **Codigo duplicado** - `Validator.sanitizeHTML()` y `escapeHtml()` son identicas. |
| 12 | `js/utils.js` + `js/register.js:155` | **Codigo duplicado** - Validacion de email implementada dos veces. |
| 13 | `js/utils.js` + `js/register.js:163` | **Codigo duplicado** - Validacion de DNI implementada dos veces. |
| 14 | `js/logic.js:276` | **Sin try/catch** en `DOMContentLoaded` - Si falla una Promise, el admin queda roto sin mensaje. |
| 15 | Multiples archivos | **50+ console.log** en produccion. |
| 16 | `js/codes.js:153-336` | **Funcion de 183 lineas** (`generateCodes`). |
| 17 | `js/state.js` + `js/staff.js:28` | **Estado duplicado** - `tempSelectedBrands` en state global Y como variable local. |

### HTML/CSS

| # | Archivo | Descripcion |
|---|---------|-------------|
| 18 | `index.html:14-244` | **230 lineas de CSS inline** en tag `<style>`. Deberia estar en archivo externo. |
| 19 | 6 archivos HTML `:5` | **`user-scalable=no`** en todos los viewports - impide zoom, problema de accesibilidad. |
| 20 | `cliente.css:51` | **`!important` excesivo** - `font-size: 16px !important` en inputs. |
| 21 | `cliente.css:391/404` | **Conflicto de tamano** - `width/height: 40px` pero `min-height: 48px` en `.btn-icon-header`. |
| 22 | `style.css:185` | **Regla CSS vacia** - `.metric-view { }` sin estilos. |
| 23 | `reclamar.css` multiples lineas | **Colores hardcoded** - Usa hex directo en vez de CSS variables definidas. |
| 24 | Multiples HTML | **Sin aria-label** en botones con solo icono (header, FAB, etc.). |
| 25 | Multiples HTML | **Sin `<noscript>`** - La app se rompe completamente sin JavaScript, sin aviso al usuario. |

---

## SUGERENCIAS (12)

| # | Area | Descripcion |
|---|------|-------------|
| 26 | `js/cliente.js` | **Archivo de ~2900 lineas** - Dividir en modulos (auth, events, tickets, purchases). |
| 27 | JS naming | Nombres inconsistentes: `doLogin` vs `loadEvents`, `openModal` vs `showView`. |
| 28 | JS magic numbers | Numeros sin nombre: `80` (pull-to-refresh), `800` (max image), `400` (max logo). |
| 29 | JS `==` vs `===` | Mezcla de comparaciones loose y strict. Estandarizar a `===`. |
| 30 | `public.html` / `ticket.html` | **JS inline** (226 y 142 lineas). Mover a archivos `.js` externos. |
| 31 | `index.html` | **1699 lineas** - Archivo HTML muy grande con multiples modales. |
| 32 | `cliente.html:417-952` | **Estructuras de modal repetidas** - Mismo patron HTML copiado 10+ veces. |
| 33 | `cliente.css:477-482` | **Animacion limitada** - Stagger solo para 6 cards, usar `calc()` para ilimitado. |
| 34 | `scanner.css` / `promotor.css` | **Sin media queries** - No tienen breakpoints responsive. |
| 35 | Todos los HTML | **Sin meta tags SEO** - Falta Open Graph, description, Twitter Card. |
| 36 | `cliente.css` | **Sin `@media print`** - No hay estilos para imprimir tickets con QR. |
| 37 | `index.html` / `cliente.html` | **Cache busting inconsistente** - index usa `?v=7.0.0`, cliente usa `?v=7.4.0`. Sin convencion. |

---

## RESUMEN FINAL

| Severidad | JS | HTML/CSS | Total |
|-----------|-----|----------|-------|
| Criticos | 5 | 5 | **10** |
| Warnings | 7 | 8 | **15** |
| Sugerencias | 5 | 7 | **12** |
| **Total** | **17** | **20** | **37** |

### Top 5 archivos con mas problemas

1. **`index.html`** - URL rota, ID duplicado, HTML mal cerrado, CSS inline, libreria duplicada
2. **`js/events.js`** - Bug logico en tabs (funcionalidad rota)
3. **`js/config.js`** - Token API expuesto (seguridad)
4. **`js/cliente.js`** - Demasiado grande (2900+ lineas)
5. **`js/logic.js`** - Import muerto, sin error handling

### Plan de accion recomendado

**Fase 1 - Inmediato (bugs y seguridad):**
- Arreglar URL rota en `index.html:293`
- Arreglar ID duplicado `nt_type`
- Arreglar HTML mal cerrado en `index.html`
- Arreglar bug de tabs anidados en `events.js:407`
- Eliminar import de `access.js`
- Quitar SheetJS duplicado

**Fase 2 - Prioridad alta:**
- Mover `APIS_PERU_TOKEN` a backend
- Agregar try/catch al init de `logic.js`
- Eliminar funciones duplicadas (escapeHtml, email, DNI)
- Arreglar conflicto CSS de `.btn-icon-header`

**Fase 3 - Deuda tecnica:**
- Dividir `cliente.js` en modulos
- Extraer CSS inline a archivos externos
- Agregar aria-labels a botones de icono
- Estandarizar naming y cache busting
