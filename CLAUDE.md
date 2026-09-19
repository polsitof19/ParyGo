# ParyGo — reglas del proyecto (leer siempre)

## Qué es
SaaS multi-tenant de venta de entradas para eventos (Lima/PE). Cada promotor =
un "brand" con subdominio <slug>.parygo.com. Modelo: Paul cobra S/200 flat por
evento (packs); el promotor usa SUS credenciales de pago (Yape/MercadoPago).
Paul nunca toca la plata de las entradas. Compradores NO se loguean.

## Stack
Next.js 14 App Router (Edge) · Supabase (RLS, pg_cron) · Resend (email) ·
MercadoPago + Yape (pagos) · Cloudflare Pages (landing + app) + Worker
(parygo-brand-router para *.parygo.com). Monorepo: apps/landing + apps/web +
supabase/migrations. NO es Firebase. No hay RENIEC. Los compradores no se registran.

## Infra — reglas duras
- Branch de trabajo: refactor/monorepo. NUNCA push a main. main quedó CONGELADA/
  legacy (landing pre-monorepo, commit viejo) — no es fuente de verdad de nada.
- Supabase mdxtpevisjiqpeklhxdv = ÚNICO proyecto = PRODUCCIÓN. Cuidado con DDL.
- SUPABASE_ACCESS_TOKEN vive en apps/web/.env.local (gitignored). Nunca commitearlo,
  nunca imprimirlo, nunca escribirlo a otro archivo.
- Cliente piloto = "Tío Code" (slug code). Su evento "Almighty" TERMINÓ el
  2026-06-21 SIN VENTAS (0 órdenes pagas) y está despublicado. Saldo de eventos
  de Code = 3. Sigue siendo cliente real: NO tocar Code/Almighty en tests.
- La venta real probada en producción es la de "hoesky" (órdenes pagas con
  tickets emitidos, verificado 2026-09-17). Tampoco se toca en tests.
- Brand de pruebas = "demotest" (se deja ARCHIVADA; `node e2e/cleanup.mjs`
  la re-archiva tras el E2E).

## Deploy (Cloudflare Pages) — cómo llega a producción
- Landing (parygo.com): proyecto Pages "parygo" (dominios parygo.pages.dev,
  parygo.com, hoesky.parygo.com). Production branch = refactor/monorepo (cambiado
  el 2026-07-22; antes era main). Push a refactor/monorepo → build + deploy a
  parygo.com. Cualquier OTRA branch → deploy Preview (URL *.pages.dev con hash),
  NO toca producción.
- App (app.parygo.com): proyecto Pages "parygo-app" (dominios parygo-app.pages.dev,
  app.parygo.com). Production branch = refactor/monorepo (VERIFICADO 2026-09-18
  con `wrangler pages project list` + `deployment list`: deploys "Production" de
  refactor/monorepo, p. ej. 465e450 → 64492e55.parygo-app.pages.dev). O sea:
  PUSH A refactor/monorepo = DEPLOY A PRODUCCIÓN DE LA APP (checkout incluido).
  Cualquier otra branch → Preview (<hash>.parygo-app.pages.dev), no toca prod.
  OJO: apps/web/wrangler.toml dice name = "parygo-web", pero ese proyecto NO
  existe en Cloudflare; el real es "parygo-app". Build/root/bindings se
  configuran en el dashboard, no en ese archivo.
- Un push a refactor/monorepo despliega LOS DOS proyectos (landing y app).
- Router de subdominios *.parygo.com: Worker "parygo-brand-router" (sirve
  <marca>.parygo.com desde la app). Nota: hoesky.parygo.com figura además como
  dominio del proyecto de la landing "parygo", pero hoy sirve la página de la
  marca Hoesky (verificado 2026-09-18); no tocarlo sin revisar el dashboard.
- Verificar deploys sin dashboard: `npx wrangler pages deployment list
  --project-name=parygo-app` (app) o `--project-name=parygo` (landing):
  Production vs Preview, branch, commit, URL. Requiere `npx wrangler login`.
- Alternativa quirúrgica (publicar sin depender de la Git-integration):
  build local (`npm run build:landing` → apps/landing/out) y luego
  `npx wrangler pages deploy apps/landing/out --project-name=parygo --branch=refactor/monorepo`.

## Flujo multi-máquina (PC + laptop)
- Al INICIAR cualquier sesión: git pull de la rama actual antes de tocar nada.
- Al TERMINAR cada avance: commit descriptivo + git push. Nunca cerrar sesión con cambios sin pushear.
- Si el pull trae conflictos: PARÁ y reportá antes de resolver.
- Una máquina a la vez por rama.

## Pagos — estado real (audit 2026-09-15)
- Yape manual: COMPLETO punta a punta. Comprobante público → revisión en panel
  (autenticada, scoped por marca, transición de estado atómica) → emisión →
  email. Es el camino que cobra hoy.
- MercadoPago: IMPLEMENTADO y endurecido, no bloqueado. Webhook en
  /api/webhooks/mp/[brandId]: HMAC obligatorio sin bypass de entorno, re-fetch
  del pago contra la API de MP, verificación del monto contra el total congelado,
  settle_mp_payment atómico (0025), idempotencia por mp_payment_id, anti-replay
  de 5 min, comparación en tiempo constante.
- PENDIENTE OPERATIVO (único): mp_webhook_secret NO tiene UI de carga ni de
  rotación. Se genera aleatorio al crear la marca en el panel super, se guarda
  encriptado (0034) y nunca se muestra; la columna en texto plano se borró (0044).
  Para que MP firme con un secret que la app reconozca hace falta un UPDATE
  manual vía RPC service-role. Sin eso, todo webhook de MP responde 401
  webhook_secret_missing y NINGUNA venta por MP se liquida.
- Precios y montos: siempre server-side. El cliente manda tipo y cantidad, nunca
  importe. Fase activa vía get_event_active_prices, congelada en order_items.
  Bulk topeado a 90% por constraint (0051). Anti-sobreventa atómico (0031).

## Orden seguro OBLIGATORIO por cada cambio
Plan/Explore (diseñar antes de codear) → migración vía Management API
(aplicar → verificar) → test en DEMOTEST (nunca Code/Almighty) → push →
smoke en prod. No acumular pasos sin validar. Pausar entre pasos de riesgo
para OK de Paul.

## Seguridad — lecciones que NO se repiten más (ya costaron caro)
- RPCs SECURITY DEFINER service-role-only: revoke execute explícito de anon Y
  authenticated. `revoke from public` NO basta (Supabase aplica ALTER DEFAULT
  PRIVILEGES que concede a anon/authenticated). Bug histórico: 0014.
- Tests de permisos SIEMPRE por capa de auth REAL (JWT del rol), NUNCA con
  service-role (saltea RLS y no prueba nada).
- Concurrencia: SELECT FOR UPDATE + test de 2 operaciones simultáneas en TODO
  lo que toque saldo / stock / códigos / escaneos. Un éxito, un rechazo.
- security-review obligatorio en cualquier cosa que toque dinero, auth o acceso.
- Firebase parygo-da36a fue ELIMINADO por Paul. Las credenciales que quedan en el
  historial (migrate-admin.html, commit 5f10af2) son INERTES. Tema CERRADO — no
  volver a reportarlo.
- M1 CERRADO (0020). apply_promo_to_order ya NO confía en p_items: deriva tipo y
  cantidad de order_items, y la base de precio de order_items.base_price_cents,
  congelada por trigger en cada INSERT (cierra el vector de inyectar una base
  falsa por INSERT directo). p_items quedó vestigial: se sigue pasando por compat
  two-phase y el RPC lo ignora. El bloqueo que este archivo imponía sobre
  MercadoPago está LEVANTADO — no volver a reportarlo como pendiente.

## Sistema de diseño — reglas duras
- Fuente única: apps/*/app/styles/parygo-tokens.css, extraído de la landing y
  corregido para pasar AA. Está DUPLICADO en apps/landing y apps/web a propósito
  (dos apps Next separadas); `npm run test:tokens` falla si divergen y corre en
  CI. Si tocás una copia, tocá la otra. Migra a packages/ui cuando el deploy de
  la app esté verificado.
- --accent y --peri son DECORATIVOS: puntos, barras, anillos de foco, trazos,
  blobs, rellenos sin texto. NUNCA color de texto ni texto blanco encima.
  Razón: en páginas públicas de marca --accent toma var(--brand), elegido por el
  promotor, y no hay forma de garantizar contraste sobre un color arbitrario.
- Botón primario = TINTA sobre acento (5.91:1 medido). Blanco sobre naranja da
  2.85:1 y FALLA AA — no usarlo nunca.
- Única excepción documentada: la palabra de acento del h1 de la landing
  (display ≥56px) usa --accent-deep #E8552A con el subrayado ondulado como
  segunda señal. Medido 3.41:1, sobre el mínimo 3:1 de texto grande. Por debajo
  de 56px el mínimo es 4.5:1 y no llega: no usarlo ahí.
- --ink-2 y --ink-3 son ALFA de la tinta, no grises hex, para que el contraste
  no dependa de sobre qué papel caigan. Piso medido para AA en las cuatro
  superficies: alfa .630. No bajarlos sin volver a medir contra --paper-3.
- Los semánticos (--ok, --warn, --alert) fallan AA como color de texto sobre
  papel: el texto de un estado va en --ink y el color lo lleva el punto.

## Migraciones
Incrementales, idempotentes, numeradas (vamos por 0052). Backwards-compatible
cuando haya venta en curso: patrón two-phase (schema → deploy → canary → flip)
para no romper la app vieja desplegada.

## Auth (modelo final)
- Super admin (Paul, paulsebastian439@gmail.com): email + contraseña (antes
  magic link; cambiado a pedido de Paul en rama feat/super-admin-redesign). El
  panel super vive en un slug oculto (no /super). Recuperación de password vía
  dashboard de Supabase. El guard real es server-side (requireSession superAdmin),
  no el slug.
- brand_admin + validator: email + password (Paul/brand_admin setean la fija).
- Cada validator tiene su código PERSONAL de puerta (8 alfanum CSPRNG) →
  trazabilidad por persona en ticket_scans.validator_user_id.
- Deuda técnica documentada: super admin conoce las passwords; sin "cambio
  obligatorio en primer login". Implementar cuando escale.

## Modelo (selección de la verdad)
- Precio: fases de preventa automáticas (ticket_type_price_phases). El precio
  activo lo resuelve get_event_active_prices contra now() (Lima UTC-5). Se cobra
  server-side y se CONGELA en order_items.unit_price_cents.
- Stock: ticket_types.is_unlimited (max_scans NULL = ilimitado).
- Códigos promo: por evento, tipos percent/fixed(por-orden)/free, límites
  ilimitado/N/por-email, tracking por RR.PP. (label + ventas por código), sin
  comisiones automáticas. Descuento sobre fase activa, congelado, server-side.

## Reportar
Por paso, con evidencia (la migración, el test de concurrencia, los tests de
permisos por JWT, el security-review). Pausar antes de pasos de riesgo para OK.

## Modelo / costo
Opus para diseño (Plan) y lo de riesgo. Sonnet/Haiku para subagents mecánicos
(review, tests). No quemar Opus en tareas mecánicas.
