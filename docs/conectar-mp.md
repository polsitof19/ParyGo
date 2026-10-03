# AGENTS.md — Conectar Mercado Pago (OAuth) para cobrar entradas con tarjeta

Plan (2026-10-03). Reglas: CLAUDE.md. Rama: `feat/conectar-mp`. Planes anteriores en `docs/`.
Doc verificada con Context7 (mercadopago developers): autorización
`https://auth.mercadopago.com/authorization?client_id&response_type=code&platform_id=mp&state&redirect_uri`
(+ PKCE `code_challenge`/`code_challenge_method=S256` si la app lo tiene activo) y
`POST https://api.mercadopago.com/oauth/token` (authorization_code / refresh_token)
→ `access_token`, `public_key`, `refresh_token`, `user_id`, `expires_in` (≈180 días).

## Objetivo
El organizador toca "Conectar Mercado Pago" en Mi marca → entra a su cuenta de MP →
vuelve a ParyGo conectado. Sus compradores pagan con tarjeta (y Yape vía MP) y la
plata va DIRECTO a la cuenta del organizador. Sin copiar claves ni webhook secret.
Paul nunca toca esa plata (no hay `marketplace_fee`).

## Lo que pone Paul (bloquea la tarea 3 en adelante)
- En su app de MP (Tus integraciones → la app de ParyGo): URL de redirección
  `https://app.parygo.com/admin/settings/mercadopago/vuelta`.
- En Cloudflare `parygo-app` (Secret): `PARYGO_MP_CLIENT_ID` y
  `PARYGO_MP_CLIENT_SECRET` (los de esa misma app; el `PARYGO_MP_ACCESS_TOKEN` y
  `PARYGO_MP_WEBHOOK_SECRET` de los packs ya están).

## Decisiones tras la revisión adversarial de Codex (2026-10-03)
- UN SOLO MODO: OAuth. Verificado: 0 marcas tienen credenciales manuales
  (`mp_access_token_enc` nulo en todas). Se retira el formulario manual
  (MpCredentialsForm) y su acción; el paso K de fase1 pasa a probar "sin
  conexión no aparece Tarjeta" + conexión simulada vía RPC. Así no hay
  transiciones manual↔OAuth ni dos secretos de webhook.
- Vendedor del pago = `collector_id` de `GET /v1/payments/{id}` (NO `user_id`):
  tiene que ser igual a `mp_oauth_user_id` o no se liquida (tipado en mpApi.ts).
- Al conectar: `GET /users/me` con el token recién canjeado; su `id` tiene que
  ser el `user_id` del canje. Si no, o si falta algo, no se guarda nada.
- Quién: membresía `brand_admin` REAL de esa marca (no staff, no super admin
  por impersonación aunque esté en modo edición). La marca sale de la sesión y
  del `state`, nunca del form. Vale para conectar, la vuelta y desconectar.
- Refresh: empieza 7 días antes del vencimiento, así el token actual sigue
  válido mientras tanto. El que pierde el candado usa el token vigente (no
  refresca). Solo si el token YA venció y no hay candado → falla cerrado esa
  operación. `invalid_grant` (refresh rechazado) = revocación confirmada →
  desconecta + aviso; timeout/5xx/429 = transitorio → conserva todo, reintenta
  la próxima vez. El par nuevo (access, refresh, expires) se guarda en UNA RPC.
  Test: dos refrescos simultáneos → un solo POST a /oauth/token (fetch simulado).
- Webhook de entradas: secreto = `PARYGO_MP_WEBHOOK_SECRET` (firma la app de
  ParyGo; doc oficial: el secreto es de la aplicación, no del vendedor).
- Webhook de packs: un pago que MP devuelve 403 con el token de Paul (de otra
  cuenta) → 200 `ignored`. El 404 SIGUE en 502 (security review M2: MP a veces
  no encuentra un pago recién creado y el reintento es lo que acredita el pack;
  un aviso ajeno que reintente no hace daño). Acreditar sigue dependiendo del
  re-pedido + `settle_pack_purchase`.
- Desconectar: mismo criterio que quitar el Yape (`marcaCobraEnVivo` con el
  único método) → bloqueado. Un pago con tarjeta ACTIVO (orden MP con
  preferencia sin pago, < 30 min) también bloquea desconectar o cambiar de
  cuenta (security review M1; 48 h bloqueaba dos días por un checkout
  abandonado). Órdenes más viejas: se dejan; un pago tardío queda como
  `mp_collector_mismatch` en la bitácora.
- Bitácora `events_log` con actor: `mp_conectado`, `mp_desconectado`,
  `mp_refresh_revocado`, `mp_conectar_fallido` (motivo, sin tokens).
- CSRF/PKCE: `state` 32 bytes + `code_verifier` en cookie httpOnly/secure/
  SameSite=Lax de 10 min atada a la marca; comparación en tiempo constante; un
  solo uso (se borra al volver, éxito o error).

## Modelo de datos (0086)
- `brands`: `mp_oauth_user_id text`, `mp_oauth_refresh_enc bytea` (pgp_sym, igual
  que 0034), `mp_oauth_expires_at timestamptz`, `mp_conectado_at timestamptz`.
  Access token y public key siguen en `mp_access_token_enc`/`mp_public_key_enc`
  (los lee `get_brand_mp_credentials`: el checkout no cambia).
- RPCs service-role-only (revoke literal de public, anon, authenticated; search_path):
  `set_brand_mp_oauth(brand, access, public, refresh, user_id, expires_at, key)`,
  `get_brand_mp_refresh(brand, key)`, `clear_brand_mp_oauth(brand)`.
- Una cuenta de MP conectada a UNA marca (índice único parcial en
  `mp_oauth_user_id`): si no, una marca podría "conectar" la cuenta de otra y
  liquidar pagos ajenos con su token.
- `set_brand_mp_oauth` limpia `mp_webhook_secret_enc` (ya no se usa).

## Flujo
1. `/admin/settings` → "Conectar Mercado Pago" (server action): exige dueña de la
   marca (no staff, no super en solo lectura), arma `state` = 32 bytes al azar +
   `code_verifier` PKCE, los guarda en cookie httpOnly/secure/SameSite=Lax 10 min
   firmada con la marca de la sesión, redirige a auth.mercadopago.com.
2. `GET /admin/settings/mercadopago/vuelta?code&state`: requiere sesión de la
   MISMA dueña; compara `state` en tiempo constante; canjea el code (con
   `code_verifier`); valida que vino `access_token`, `public_key`, `user_id`;
   rechaza si ese `user_id` ya está en otra marca; guarda vía `set_brand_mp_oauth`;
   borra la cookie; `events_log` `mp_conectado`; redirige a `/admin/settings#cobro`
   con aviso. Cualquier error → aviso en palabras del organizador, nada guardado.
3. Refresco perezoso: `getBrandAccessToken` (lib/mercadopago.ts) si
   `mp_oauth_expires_at < now() + 7 días` refresca con `tomar_candado`
   `mp_refresh:<brand>` (un solo refresco a la vez) y guarda el par nuevo. Si el
   refresh falla (revocado), la marca queda "desconectada" y el checkout no ofrece
   tarjeta (fail-closed), con aviso en el panel.
4. Webhook de pagos de una marca conectada: la preferencia sigue con
   `notification_url` → `/api/webhooks/mp/[brandId]`; la firma la hace la app de
   Paul (las credenciales salen de ella) → secreto = `PARYGO_MP_WEBHOOK_SECRET`.
   Validar además `collector_id` del pago re-pedido == `mp_oauth_user_id`. La
   vuelta del comprador (0083/0084) sigue de respaldo.
   VERIFICAR con un pago real chico antes de dar por cerrado.
5. `/api/webhooks/parygo-mp` (packs): 403 al re-pedir → 200 `ignored`; 404 → 502
   (reintento), ver Decisiones.
6. "Tiene método de pago" (`lib/metodoPago.ts marcaTieneMetodo`) = Yape O MP
   conectado. Checkout: "Tarjeta" aparece solo con MP conectado y vigente.
7. "Desconectar": borra tokens (`clear_brand_mp_oauth`); si era el único método y
   hay eventos que cobran a la venta, mismo bloqueo que con el Yape.

## Tareas
- [x] 1. 0086 (columnas, RPCs, índice único) + ensayo + prueba de permisos JWT
  real (anon y brand_admin NO ejecutan las RPCs nuevas). **Listo:** dryrun OK,
  aplicada, `e2e/mp-oauth-rpc.mjs` verde.
- [x] 2. `lib/mpOauth.ts`: armar URL (state + PKCE S256 con Web Crypto),
  canjear code, refrescar; fetch directo (SDK prohibido en el edge). Tests
  unitarios del PKCE y de la validación de respuesta. **Listo:** test verde.
- [x] 3. Botón + server action + ruta de vuelta + Desconectar en Mi marca
  ("Cómo te pagan": Yape (Perú) · Mercado Pago (tarjeta y más)). Textos con
  `t()`. **Listo:** fase1 + panel-en verdes; captura 390/1440.
- [x] 4. Refresco perezoso con candado + fail-closed + aviso. **Listo:** test
  con token vencido simulado (sin llamar a MP real).
- [x] 5. Webhook: secreto por tipo de conexión + `user_id`; packs ignoran otros
  `user_id`. **Listo:** mp-liquidar + caso nuevo verdes.
- [x] 6. `marcaTieneMetodo` cuenta MP conectado; checkout. Retirar
  MpCredentialsForm y su acción; actualizar paso K de fase1. **Listo:**
  publicar-metodo con caso "solo MP" + fase1 verde.
- [ ] 7. security-reviewer + Codex adversarial + un pago REAL chico (S/ 1) de
  Paul con una marca de prueba conectada a una cuenta de MP suya distinta.
  **Listo:** aviso firmado llega a `/api/webhooks/mp/<marca>` y pasa la firma,
  `collector_id` = la cuenta conectada, la orden se liquida UNA vez, y un pack
  de Paul se sigue acreditando por su camino de siempre.

## Fuera de alcance
Comisión de ParyGo por venta (`marketplace_fee`), PayPal de entradas, pago manual
por país, cripto, Stripe, reembolsos desde el panel.

## Bloqueos
- Tarea 7 (pago real): Paul no tiene segunda cuenta de MP → se hará con usuarios de PRUEBA de MP (POST /users/test) apenas estén PARYGO_MP_CLIENT_ID/SECRET.
- Tareas 3+ en vivo esperan `PARYGO_MP_CLIENT_ID/SECRET` y la URL de redirección.
