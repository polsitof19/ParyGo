# E2E Fase 2 — fixes de los bugs del E2E (2026-09-17)

Rama `fix/e2e-septiembre` (desde `refactor/monorepo` @ `e989970`). Sin merge. Sin migraciones.
Verificación: build de producción local (`next build` + `next start`) contra Supabase de producción,
solo marca `demotest`. Log final: `tmp/e2e/run-fase2-final.log` (local).

## A→K después de los fixes

| Paso | Antes (Fase 1) | Ahora | Checks |
|---|---|---|---|
| A. Super admin | ✅ | ✅ | 8/8 (incluye bug 5) |
| B. Organizador | ✅ | ✅ | 19/19 (incluye bug 4 y review) |
| C. Página pública | ✅ | ✅ | 6/6 (incluye cosmético 7) |
| D. Yape | ✅ | ✅ | 4/4 |
| E. Aprobar | ✅* | ✅* | 3/3 (*email no verificable en local: sin RESEND_API_KEY) |
| F. Cortesías | ✅ | ✅ | 7/7 (incluye bug 3 y cosmético 8) |
| G. Puerta | ✅ | ✅ | 7/7 (incluye bug 6) |
| H. Agotar VIP | ❌ | ✅ | 8/8 (bug 2) |
| I. Rechazo | ✅ | ✅ | 4/4 |
| J. Panel | ✅ | ✅ | 6/6 |
| K. MercadoPago | ❌ | ❌ | 5/6 — bug 1 (`orders_check`), fuera de alcance por pedido |

Total: 77/78 checks.

## Qué cambió por bug

**Bug 3 — Cortesía S/0 pública quemaba cupo** (`e2b911c`, security-reviewer ✔)
- `lib/publicTicketGuard.ts`: guard server único (tipo activo con precio activo > 0; evento publicado, no archivado,
  no cancelado, no terminado; marca no archivada).
- `reserveStock` (server action pública) lo aplica **antes** de reservar. Antes reservaba 15 min cualquier tipo de
  cualquier evento, incluso no publicados o de marcas archivadas.
- `startCheckout`: guard por ítem antes de crear la orden, y el código promo se pre-valida (solo lectura) antes de reservar.
- Página del evento y landing: sin tipos S/0.
- **Desvío de la instrucción**: pediste mostrar los S/0 si el evento es gratis. No lo hice. El checkout nunca pudo
  cerrar un total S/0 sin código promo ("Total inválido."), así que mostrarlos era un callejón sin salida que además
  dejaba a cualquiera retener el cupo. Encima "gratis" inferido por precio es manipulable: desactivar los tipos pagos
  expondría la Cortesía (hallazgo del security-reviewer). Para eventos gratis hace falta un flag `is_courtesy`
  (migración) más un flujo de emisión gratis. Antes tampoco funcionaban, así que no es regresión.
- Tests: la reserva y el checkout se re-envían armados a mano (el request real capturado, cambiando el tipo por la
  Cortesía) → rechazados, 0 cupo retenido, sin orden. Un promo inválido se rechaza sin orden.

**Bug 2 — sold out con error crudo** (`e2b911c`)
- Toast "No quedan suficientes entradas de VIP."
- Si el carrito queda en 0 estando en el paso 2, vuelve al paso 1. Continuar y el botón de pagar se deshabilitan con 0 entradas.
- `startCheckout`: los mensajes de validación salen en español (errorMap de zod); ningún texto en inglés llega al comprador.

**Bug 4 — validaciones de evento** (`873fd59`, `fd82065`, security-reviewer ✔)
- `lib/eventValidation.ts`: inicio no pasado (10 min de gracia), fin > inicio, S/0 + ilimitado bloqueado, S/0 con aforo solo con confirmación.
- Se aplica al crear (panel y cabina, **antes** del flyer y del RPC que gasta saldo), editar, postergar, clonar,
  publicar y crear/editar tipos (panel y cabina). Confirm/alert en la UI; el server revalida.
- Editar la fecha o postergar ahora corre el fin con el mismo delta.
- Por el review: clonar un evento pasado ya no gasta saldo, las fases de preventa se guardan en hora de Lima
  explícita, `limaToIso` es estricto, y el guard de publicar lee filtrando por la marca.
- **Zona horaria**: crear evento hacía `new Date('YYYY-MM-DDTHH:mm')` en el server. En Cloudflare (UTC) eso corre
  el evento 5 h antes. Ahora se usa hora de Lima explícita.
- Tests: el request real de "Crear evento" se re-envía con fecha pasada, fin antes del inicio, S/0 ilimitado y sin
  confirmación → sin evento y sin gastar saldo. Además: alerta del builder, editar +1 día (misma duración), editar al
  pasado, publicar un evento vencido y clonar un evento vencido.

**Bug 6 — /scan listaba borradores y archivados** (`b2995b0`): filtro `is_published` + `archived_at is null`. Test en G.

**Bug 5 — la cabina no confirmaba** (`2a7902e`, `5558041`)
- Verificado en **prod** (app.parygo.com): "Setear contraseña" aplicaba el cambio sin ninguna confirmación.
- La causa es que el mensaje de `useFormState` no sobrevive al `revalidatePath` de la misma página.
- `components/useFormFeedback.ts` agrega un toast con el resultado apenas vuelve la acción. Está aplicado a los 5
  formularios de la ficha de marca y a 9 del panel del organizador. El E2E mostró que "Emitir cortesías" tenía el
  mismo problema.

**Cosmético 7** ("desde S/ 0"): resuelto con el bug 3. **Cosmético 8** (`c97d84c`): `email_sent` solo es true si el
mail salió; se guarda `email_status`, y el mensaje avisa si no se envió.

**CLAUDE.md** (`b9dfe38`): Almighty terminó el 21-jun sin ventas (0 órdenes pagas); la venta real probada es hoesky
(3 órdenes pagas, 5 tickets). Se mantiene la regla de no tocar Code ni hoesky en tests.

## Code review de la rama (`2f91a77`)
- Sin regresiones en Yape ni en la reserva atómica.
- Bloqueante arreglado: toast duplicado en "Editar evento" y "Ajustes" (quedaba un `useEffect` viejo).
- Arreglados también:
  - el campo del error de fecha ya no se deduce del texto;
  - una sola regla de "evento terminado" (`eventOverAt`);
  - una sola lectura de fases;
  - la cabina no reconfirma un S/0 que ya era S/0;
  - se loguean los errores de los RPC, y el guard falla cerrado si no hay precio activo;
  - el `min` de las fechas del builder en hora de Lima.
- Verificado (solo lectura): en prod no hay tipos S/0 + ilimitado que la regla nueva deje trabados.
- La suite completa se corrió de nuevo después del review: mismo 77/78.

## Hallazgos para Paul (no tocados: no son demotest)
- **hoesky/density-04** tiene el fin (27-jun) antes del inicio (20-jul): es el bug de "cambiar la fecha no mueve el
  fin", ya corregido para adelante. Ya pasó, así que no afecta ventas.
- **Zona horaria histórica**: hoesky/charangahabanera arranca 16:00 hora Lima, que coincide con 21:00 corrido 5 h.
  Todos los eventos reales ya pasaron: no hay que corregir nada próximo.

## Fuera de alcance (por pedido)
- Bug 1 (MercadoPago / `orders_check`): va aparte, con migración.
- Bug 9 (reingreso): esperando tu decisión.

## Deuda anotada
- Las reglas de fecha y precio viven en la capa de server actions. Los RPC que gastan saldo no las repiten: están
  cerrados a anon/authenticated (0014), pero un segundo llamador futuro tendría que validar (mismo patrón que M1).
- El TOCTOU entre el guard y la reserva es de bajo impacto; blindarlo del todo requiere moverlo a SQL.
