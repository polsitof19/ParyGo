# AGENTS.md — Bloque "Cuentas": código al correo, contraseña segura y prueba gratis de 10 entradas

Plan de trabajo (2026-10-01). Lo ejecuta Claude o Codex por tareas, en orden. Reglas del repo: CLAUDE.md (manda ante cualquier duda). Rama: `cuentas/codigo-prueba` desde `refactor/monorepo`.

## Por qué
Paul (2026-10-01):
1. TODA cuenta nueva confirma su correo con un código antes de seguir (prueba o paquete), "para que no creen así como si nada".
2. Contraseña de 8+ caracteres con mayúscula, minúscula y número.
3. Volver a ofrecer una PRUEBA GRATIS: 1 evento, hasta 10 entradas, para que el organizador pruebe todo solo (crear entradas pagas, cobrar, escanear).

## Flujo final de /empezar
`¿Qué vas a organizar?` → paquete (para "marca": **Prueba gratis** · 1 · 3 · 5 · 10; privado: 1) → nombre → enlace → correo + WhatsApp → **código de 8 dígitos** → contraseña (con la regla) → **Pagar** (paquete) o **Crear mi prueba** (prueba).

## Diseño
- **Código**: se reusa el flujo borrado en `ff5e58d` (`git show ff5e58d^:apps/web/app/empezar/actions.ts`, `enviarCodigo`/`confirmarAlta`, y `ff5e58d^:apps/web/lib/email/sendCodigoAlta.ts`): `generateLink` de Supabase da `email_otp`; usuario nuevo se crea SIN confirmar con contraseña al azar; el correo lo manda Resend con nuestro diseño (sin el nombre de marca tipeado); `verifyOtp` lo confirma. Reglas que NO se aflojan (security review 2026-09-25): antes de generar un link buscar el correo con `usuario_id_por_email` (un magiclink pisa el token vigente de otra persona); cuenta CON marca (dueña, puerta o super admin) → "ya tienes cuenta, ingresa" por correo (el form no enumera); cuenta confirmada SIN marca → código igual (equivale a recuperar la contraseña: el código llega a su casilla; sin esto quien verificó y no pagó no podía terminar — Codex P2 2026-10-01, falso positivo por diseño); tope `dentroDelTope` (5 por correo, 20 por IP por hora) en enviar Y en reenviar; tope de intentos al verificar (5 por correo por hora; la deuda "PENDIENTE: tope de intentos" de CLAUDE.md se cierra acá).
- **Después del código** el correo está verificado: la contraseña se fija con `updateUserById` (recién ahí, nunca antes), se abre sesión y:
  - **Paquete**: `pagarAlta` crea la marca ARCHIVADA y SIN dueña como hoy (así `limpiar_altas_abandonadas` 0072 la sigue limpiando) y guarda `created_by_user` = el usuario verificado en el `events_log` / la compra; `completarAlta` (/empezar/listo) exige que la sesión sea ESE usuario (ya no crea la cuenta: solo membresía + publicar). La contraseña deja de viajar por sessionStorage.
  - **Prueba**: crea la marca con dueña = el usuario, `prueba_disponible = true`, publicada; entra directo a /admin. Una persona = una marca (índice `brand_members_un_dueno`).
  - Las cuentas nuevas YA NO llevan `alta_sin_verificar`; las restricciones de esa bandera quedan para las cuentas viejas que la tengan.
- **Contraseña**: regla única `lib/password.ts` (`passwordOk(p)`: ≥8, ≤72, una minúscula, una mayúscula, un número) + texto `t('…','…')`. Se usa en TODOS los lugares que fijan contraseña (buscar `password` en `app/**/actions.ts`: /empezar, /empezar/listo, reset/cambio de contraseña, cabina al crear dueña, staff). Además se configura en Supabase Auth por la Management API (`password_min_length: 8`, `password_required_characters` minúsculas:MAYÚSCULAS:números) para que el server la imponga aunque un camino se olvide. Las cuentas existentes siguen entrando; la regla aplica al crear o cambiar.
- **Ajustes por la revisión adversarial de Codex (2026-10-01):**
  - **Correo atado a la sesión** (alta): `pagarAlta`/`crearPrueba` NO leen el correo del form: usan el de la sesión verificada (`getUser`), y `contact_email` = ese.
  - **Dueña prevista en la marca**: columna nueva `brands.alta_usuario uuid` (0080) que guarda quién verificó el correo. `pack_purchases.created_by` SIGUE en null para las altas (es el centinela de `limpiar_altas_abandonadas` 0072 y de /listo: no se toca).
  - **Volver de MP en otro navegador**: /empezar/listo sin sesión → `/login?next=/empezar/listo?compra=…`; con sesión, solo reclama si `session.user.id = brands.alta_usuario`. El UUID de la compra solo NO alcanza.
  - **Doble envío / dos pestañas al pagar**: candado por marca (`pg_advisory_xact_lock` en una RPC chica o reusar la compra `pending` de < 2 h de esa marca en vez de crear otra). Test: 2 `pagarAlta` simultáneos → 1 compra.
  - **Abuso de la prueba**: para la prueba el WhatsApp es OBLIGATORIO; 1 prueba por WhatsApp normalizado, 1 por correo y 3 por IP por día (tabla de intentos existente o `register_ticket_resend_attempt` con prefijo `prueba:`). `crearPrueba` con candado para no crear dos.
  - **Estafa con eventos falsos**: la página pública de una marca en prueba muestra una etiqueta discreta "Evento de prueba" (decisión de Paul pendiente; por defecto SÍ). El tope de 10 entradas limita el daño.
  - **Pruebas abandonadas**: extender la limpieza diaria: marca en prueba sin eventos a los 30 días → se archiva y se libera el link (nunca si tiene eventos, órdenes, entradas o comprobantes).
  - **Carrera del código**: reenviar con espera de 60 s por correo y generación serializada por correo (advisory lock en una RPC o fila de intentos con `FOR UPDATE`): nunca dos `generateLink` a la vez para el mismo correo.
  - **Contraseñas que genera el SERVER** (no lo vio Codex): toda contraseña al azar (`crypto.randomUUID()+…` del flujo viejo, puestos de puerta `@gate.parygo.local`, staff) tiene que cumplir la regla nueva o Supabase la rechaza al activar la política. Revisarlas TODAS antes de la tarea 3 (helper `passwordAlAzar()` con mayúscula, minúscula y número).
- **Tope de la prueba = 10**: migración `0080_prueba_10_entradas.sql` (`create or replace function prueba_tope_entradas() returns int … select 10`) + `lib/prueba.ts` `PRUEBA_TOPE_ENTRADAS = 10`.

## Tareas (en orden; marcar al terminar)
- [x] 1. Rama `cuentas/codigo-prueba` desde `refactor/monorepo` actualizada. **Listo:** `git log` muestra la rama nueva.
- [x] 2. `lib/password.ts` + usarla en todos los que fijan contraseña (lista en el PR). **Listo:** `rg "password" app -g "actions.ts"` → cada setter llama `passwordOk`; tsc limpio.
- [x] 2b. `passwordAlAzar()` y reemplazo de TODA contraseña generada por el server (alta, puestos de puerta, staff). **Listo:** `rg "randomUUID\(\) *\+|password:" app lib` → todas pasan `passwordOk`; e2e de puerta/equipo en verde.
- [x] 3. ⚠ SE APLICA EN EL DEPLOY, NO ANTES: el /empezar en producción acepta contraseñas sin mayúscula y crea la cuenta DESPUÉS del pago; con la regla activa ese createUser fallaría con el pack ya pagado. Comando listo: `node supabase/mgmt.mjs auth politica` (hoy: min 8, letras:números). Config de Supabase Auth (password policy) vía `supabase/mgmt.mjs` (GET antes y después, sin imprimir secretos). **Listo:** el GET muestra min 8 y los tres grupos; crear un usuario con `abcdefgh` falla.
- [x] 4. `0080_cuentas_prueba.sql`: `prueba_tope_entradas()` = 10, columna `brands.alta_usuario` (solo service role la escribe: revoke de anon/authenticated + sin policy de escritura), RPC de candado por correo/marca si hace falta, y la limpieza de pruebas abandonadas (extender `limpiar_altas_abandonadas`). Dryrun → aplicar → verificar; `lib/prueba.ts` = 10. **Listo:** e2e/prueba-0069.mjs en verde; JWT anon/authenticated no escriben `alta_usuario`.
- [x] 5. Server actions `enviarCodigo`, `reenviarCodigo`, `confirmarCodigo` (reusando ff5e58d) + `sendCodigoAlta` de vuelta. **Listo:** con correo nuevo llega el código (en E2E se lee con `generateLink` igual que antes); con correo de cuenta confirmada → "ingresa"; 6º envío en 1 h → "muchos intentos".
- [x] 6. `pagarAlta` y `completarAlta` con sesión verificada (sin sessionStorage de contraseña). **Listo:** paquete pagado (simulado con `settle_pack_purchase` como hoy) → la marca se publica SOLO si la sesión es el usuario verificado; otra sesión → rechazo.
- [x] 7. Prueba gratis: opción en el paso 1 (solo tipo marca), `crearPrueba` server action. **Listo:** marca publicada con `prueba_disponible`, dueña = usuario, entra a /admin; un segundo intento con el mismo usuario → rechazo.
- [x] 8. UI de /empezar: paso "código" (8 casillas, autocompletado `one-time-code`, Reenviar, Cambiar correo) y paso contraseña con la regla en vivo (según maqueta `tmp/maquetas-panel/v2/salida/5-empezar-codigo-*.png`). Textos ES/EN en `textos.ts`. **Listo:** capturas a 390 y 1440 sin desbordes; botón fijo abajo en <960.
- [x] 9. Landing: volver la "Prueba gratis" a Precios y a los botones ("Prueba gratis" / "Free trial") con link a `/empezar?tipo=marca&pack=prueba`. **Listo:** build de la landing + test:tokens.
- [x] 10. E2E: actualizar `e2e/empezar.mjs` (código, contraseña débil rechazada, prueba, paquete con sesión) y correr fase1, panel-en, privado-0075, prueba-0069, packs-rpc. **Listo:** todo en verde.
- [x] 11. security-reviewer + Codex adversarial sobre el diff. Corregir bugs reales. **Listo:** sin bloqueantes.
- [x] 12. CLAUDE.md al día (SIN PRUEBA GRATIS → historia; nueva sección "CUENTAS CON CÓDIGO"). Merge con OK de Paul y deploy verificado.

## Fuera de alcance
Panel nuevo (Primeros pasos, Yape/métodos de pago, builder con tope): es el bloque siguiente. Mercado Pago con conectar cuenta, PayPal de entradas, cripto: bloques posteriores. No se toca el cobro de entradas.

## Estado (2026-10-01)
Tareas 1–11 hechas (empezar 53/53, capturas 8/8, login-next 19/19, permisos 8 tablas; security review: M1–M4 y B2 corregidos; Codex: 1 falso positivo). Tarea 3 (política de Auth) y 12 (merge/deploy) en curso.

## Bloqueos
(anotar acá lo que frene una tarea, en vez de improvisar)
