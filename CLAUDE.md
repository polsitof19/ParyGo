# ParyGo — reglas del proyecto (leer siempre)

## Qué es
SaaS multi-tenant de venta de entradas para eventos (Lima/PE). Cada promotor =
un "brand" con subdominio <slug>.parygo.com. Modelo: Paul cobra S/200 flat por
evento (packs); el promotor usa SUS credenciales de pago (Yape/MercadoPago).
Paul nunca toca la plata de las entradas. Compradores NO se loguean.

## Stack
Next.js 14 App Router (Edge) · Supabase (RLS, pg_cron) · Resend (email) ·
MercadoPago + Yape (pagos) · Cloudflare Pages (parygo-app) + Worker
(parygo-brand-router para *.parygo.com). Monorepo: apps/landing + apps/web +
supabase/migrations. NO es Firebase. No hay RENIEC. Los compradores no se registran.

## Infra — reglas duras
- Branch de trabajo: refactor/monorepo. NUNCA push a main. main quedó CONGELADA/
  legacy (landing pre-monorepo, commit viejo) — no es fuente de verdad de nada.
- Supabase mdxtpevisjiqpeklhxdv = ÚNICO proyecto = PRODUCCIÓN. Cuidado con DDL.
- SUPABASE_ACCESS_TOKEN vive en apps/web/.env.local (gitignored). Nunca commitearlo,
  nunca imprimirlo, nunca escribirlo a otro archivo.
- Cliente piloto = "Tío Code" (slug code), evento "Almighty" VENDIENDO EN VIVO.
  Saldo de eventos de Code = 3. JAMÁS romper la venta de Almighty ni tocar Code/
  Almighty en tests. Brand de pruebas = "demotest" (is_published=false).

## Deploy (Cloudflare Pages) — cómo llega a producción
- Landing (parygo.com): proyecto Pages "parygo" (dominios parygo.pages.dev,
  parygo.com, hoesky.parygo.com). Production branch = refactor/monorepo (cambiado
  el 2026-07-22; antes era main). Push a refactor/monorepo → build + deploy a
  parygo.com. Cualquier OTRA branch → deploy Preview (URL *.pages.dev con hash),
  NO toca producción.
- App (app.parygo.com): proyecto Pages "parygo-app" (parygo-app.pages.dev).
- Router de subdominios *.parygo.com: Worker "parygo-brand-router".
- Verificar deploys sin dashboard: `npx wrangler pages deployment list
  --project-name=parygo` (Production vs Preview, branch, commit, URL).
- Alternativa quirúrgica (publicar sin depender de la Git-integration):
  build local (`npm run build:landing` → apps/landing/out) y luego
  `npx wrangler pages deploy apps/landing/out --project-name=parygo --branch=refactor/monorepo`.

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
- Hardening pendiente M1: apply_promo_to_order confía en p_items. Seguro HOY
  (único llamador pasa datos server-trusted). BLINDAR antes de agregar cualquier
  segundo llamador — el webhook de MercadoPago (Sprint 4 PASO 2) ES ese segundo
  llamador. No agregar MP sin blindar M1 primero.

## Migraciones
Incrementales, idempotentes, numeradas (vamos por 0019). Backwards-compatible
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
