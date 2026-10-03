# E2E Fase 1 (A→K)

Recorrido completo de ParyGo con Playwright contra un server **local** de `apps/web`
que habla con Supabase de **producción**. Solo toca la marca `demotest`
(nunca Code/Almighty). Sin migraciones, sin Cloudflare.

## Correr

```bash
npm install                        # instala playwright (devDependency de la raíz)
npx playwright install chromium
node e2e/patch-next-windows.mjs    # SOLO Windows (ver abajo). Idempotente.
cd apps/web && npx next build && NODE_OPTIONS=--max-old-space-size=1024 npx next start -p 3001   # en otra terminal (tope de RAM)
node e2e/fase1.mjs                 # capturas + results.json en tmp/e2e/
node e2e/cleanup.mjs               # deja demotest como estaba (archivada)
```

Correr desde PowerShell/cmd (no hace falta Git Bash). `next dev` también sirve una vez
aplicado el parche, pero `next build && next start` es lo más parecido a prod.

## Qué hace cada paso

| Paso | Qué prueba |
|---|---|
| A | Super admin (cabina): desarchiva demotest, carga Pack 1, setea la contraseña del brand_admin, stats |
| B | Brand admin (login real): evento a 10 días con ends_at; General S/20→S/30 (preventa), VIP S/50 ×5, Cortesía S/0 ×10; promo 20%; publicar; evento con fecha pasada |
| C | Página pública: landing, selector, paso 1→2, totales con promo, checkout |
| D | Yape: comprobante dummy → orden pendiente, sin tickets |
| E | Aprobar → 3 tickets → email (ver nota) → `/t/[qr]` con QR |
| F | 10 cortesías emitidas sin pago; la 11ª se rechaza |
| G | Puerta (`/scan`): 1º pasa, 2º "YA USADO", QR inventado "TICKET INVÁLIDO", trazabilidad |
| H | Agotar VIP con pendientes → 6ª falla → "Agotado" |
| I | Rechazar comprobante → cliente ve "rechazado" → cupo liberado y recomprable |
| J | Panel: tabla por tipo = DB, recaudado, clientes, Accesos se refresca solo |
| K | MercadoPago: oculto sin credenciales, visible con credenciales, se quita |

## Auditoría de iPhone de los paneles

```bash
node e2e/audit-iphone.mjs                      # las 26 vistas, 390 y 430
node e2e/audit-iphone.mjs --panel super        # solo /cabina-*
node e2e/audit-iphone.mjs --only salud --shot x  # una vista + captura
```

Abre cada vista de los dos paneles y de la puerta en **WebKit** (el motor de
Safari) a 390x844 y 430x932, y MIDE: overflow horizontal del documento,
elementos que se salen, texto recortado sin "…", áreas de toque por debajo de
44px, controles montados uno sobre otro, números de stat que no caben.
El informe queda en `tmp/iphone/audit.json` con el selector de cada hallazgo.

**El objetivo es cero en todo**, con una excepción conocida: un link en medio de
una frase (`a.s-textlink` en /editar) mide 36px de alto porque es el renglón
del párrafo. WCAG 2.5.8 exime justamente a los targets "en una oración o bloque
de texto"; estirarlo rompería el interlineado del párrafo.

Notas de medición:
- WebKit le da caja a lo que vive dentro de un `<details>` cerrado, y a lo
  escondido con `clip-path`. El auditor los descarta, si no reporta fantasmas.
- Una casilla dibuja 18px pero lo que se toca es su `<label>`: se mide la
  etiqueta.
- Un control puesto ADENTRO de su campo (el ojo de la contraseña) se monta
  sobre el campo a propósito; eso no cuenta como "montado".
- La `safe-area` se inyecta como variable porque `env()` da 0 en headless.
  Ojo: el layout raíz NO declara `viewport-fit: cover`, así que en un iPhone
  real iOS ya deja el contenido dentro del área segura y los paneles nunca
  quedan bajo la isla. Agregar `cover` metería el topbar sticky debajo de la
  barra de estado — no se hace sin revisar todas las superficies.

## Sesiones

- Super admin: JWT real vía magic link generado con service-role (no envía mail ni
  cambia la contraseña).
- Brand admin demotest: login por formulario con la contraseña que setea el paso A
  (`E2E_ADMIN_PASS` para cambiarla).
- Validador demotest: JWT real vía magic link (igual que el super admin).

## Por qué hay un parche de `next` en Windows

Next 14.2.18 en Windows + monorepo (con `next` hoisteado) arma mal el manifest de
módulos cliente para el runtime edge: todas las páginas dan 500 con
`Cannot read properties of undefined (reading 'default')`. Además, el sandbox edge de
`next start` en Node no reconoce el `File` subido (Yape responde "Falta la captura
del comprobante."). En Cloudflare (Linux/workerd) no pasa ninguna de las dos.
`patch-next-windows.mjs` corrige ambas cosas **solo en `node_modules`** (gitignored).
Un `npm install` lo revierte.

## Limitaciones conocidas

- Email: sin `RESEND_API_KEY` en `apps/web/.env.local` el envío queda en `skipped`
  (por diseño), así que no se puede verificar en local.
- Cada corrida carga un Pack 1 ficticio en demotest; queda en `events_log`
  (`event_balance_pack_loaded`, S/200).
