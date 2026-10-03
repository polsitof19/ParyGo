# AGENTS.md — Vender fuera de Perú: moneda, hora y pago manual por país

Plan del 2026-10-03 (Paul: "avanza"). El plan anterior (Conectar Mercado Pago)
quedó en docs/conectar-mp.md; su tarea 7 (prueba con usuarios de prueba de MP)
espera el Client ID/Secret de Paul.

## Objetivo
Que una marca de Colombia, México, Chile, Argentina, Ecuador, España o EE. UU.
venda entradas en SU moneda, con SU hora, y cobre con el medio de su país
(Nequi, Bizum, Zelle, USDT o transferencia) con el mismo flujo probado de Yape:
el comprador paga, sube el comprobante, el organizador aprueba, sale la entrada.
ParyGo sigue sin tocar la plata de las entradas.

## Decisiones
- **País = preset.** La marca elige su país en Mi marca; eso fija `moneda` y
  `zona_horaria` (columnas propias, no derivadas: EE. UU. tiene varias zonas).
  Países v1: Perú (PEN, America/Lima), Colombia (COP, America/Bogota), México
  (MXN, America/Mexico_City), Chile (CLP, America/Santiago), Argentina (ARS,
  America/Argentina/Buenos_Aires), Ecuador (USD, America/Guayaquil), España
  (EUR, Europe/Madrid), EE. UU. (USD, America/New_York; v1 una sola zona).
- **La moneda NO cambia con eventos.** Un trigger (`guard_brand_moneda`) rechaza
  cambiar `moneda` si la marca tiene CUALQUIER evento (ver Decisiones). Los precios guardados son
  centavos de la moneda de la marca (×100 siempre, también CLP/COP: así no cambia
  ningún cálculo, solo cómo se muestra). La zona sí se puede cambiar (las fechas
  son timestamptz; solo cambia cómo se leen y se escriben).
- **Un medio manual por marca** (`brands.metodo_manual`): yape | nequi | bizum |
  zelle | usdt | transferencia. Reusa `yape_number` (cuenta), `yape_holder`
  (titular; en USDT, la red) y `yape_qr_url` (QR). Los nombres de columna quedan
  por historia: renombrar rompe la app desplegada (two-phase) y no gana nada.
  `payment_method = 'yape_manual'` pasa a significar "pago manual con
  comprobante" para todos; el flujo (revisión, vencimiento a 48 h sin
  comprobante, avisos de 12 h, issue_tickets_atomic) no cambia.
- **Medio permitido según moneda** (lo valida el server Y un CHECK en la base):
  yape→PEN · nequi→COP · bizum→EUR · zelle→USD · usdt→USD · transferencia→cualquiera.
  Mercado Pago (OAuth) sigue SOLO en PEN: con otra moneda no se ofrece Tarjeta.
- **Validación de la cuenta por medio** (lib/metodoManual.ts, regla única para
  Mi marca y cabina): yape = la de lib/yapeNumber.ts · nequi = celular CO de 10
  dígitos que empieza en 3 · bizum = móvil ES de 9 dígitos que empieza en 6 o 7
  (limpia +34) · zelle = correo o teléfono US de 10 dígitos · usdt = dirección
  TRC20 (`T` + 33 base58) o EVM (`0x` + 40 hex) y la red obligatoria ·
  transferencia = texto libre de 6 a 200 (banco + cuenta/CBU/CLABE/IBAN).
- **Textos**: el comprador ve el nombre del medio ("Paga con Nequi"); el panel
  dice "Pagos por aprobar" (y "Yapes por aprobar" solo si el medio es Yape).
  La URL /yape del comprador queda igual (interna).

## Decisiones tras la revisión adversarial de Codex (2026-10-03)
- La moneda se BLOQUEA apenas la marca tiene un EVENTO (no una orden): los
  precios, fases y cupones fijos de un evento ya están escritos en la moneda de
  entonces (Codex 1, 2). Las marcas nuevas eligen país antes de crear su primer
  evento; Code y Hoesky quedan en PEN. Carrera: un trigger BEFORE INSERT en
  events toma `FOR SHARE` sobre la fila de la marca, así un cambio de moneda y
  un evento nuevo se serializan; test de concurrencia (Codex 9).
- CLP y COP solo enteros: `aCentavos` rechaza fracciones en esas monedas en
  TODOS los escritores de precio (tipos, fases, cupón fijo) y los inputs usan
  step 1 (Codex 3).
- `startCheckout` relee `moneda` y `metodo_manual` de la marca en el server:
  manual solo si el medio es compatible; MP solo si la moneda es PEN, aunque
  alguien llame a la acción directo; la liquidación sigue rechazando no-PEN
  (Codex 4, 5).
- Escritores de la cuenta (Mi marca, cabina crear/editar) validan con
  lib/metodoManual.ts según el medio; `marcaTieneMetodo` sigue contando
  `yape_number` (ahora "cuenta del medio manual") y MP solo en PEN (Codex 6).
- El medio NO cambia mientras haya pagos manuales por aprobar (la página de
  pago lee la marca en vivo) (Codex 8). Cambiar la cuenta sigue como hoy con Yape.
- Hora: incluye el editor del evento (hoy resta 5 h a mano), el asistente, las
  fases de precio, `formatEventDate` de los correos, conceptos.tsx y el "hoy"
  del panel. Una hora que no existe por el cambio de horario se RECHAZA
  ("esa hora no existe ese día") (Codex 10, 11). El día de los clics de RR. PP.
  (0049, SQL) sigue en hora de Lima: es una estadística, se anota.
- Textos: el formulario del comprador ("Monto que yapeaste (S/)" →
  "Monto que pagaste" en su moneda), los correos de Yapes por aprobar y
  recuperación, y los errores dejan de decir Yape cuando el medio es otro
  (Codex 12, 13).
- Descartado: matriz país→medio (Codex 7). Zelle y USDT quedan para toda marca
  en USD; el organizador elige lo que usa. La exposición de la cuenta en la
  página de pago ya era la de Yape (Codex 15). Los defaults (PEN, Lima, yape)
  dejan válidas todas las filas actuales: el deploy viejo sigue funcionando
  con la 0088 aplicada (Codex 16).

## Modelo de datos (0088)
```
brands.moneda         text not null default 'PEN'   check in (PEN,USD,COP,MXN,CLP,ARS,EUR)
brands.zona_horaria   text not null default 'America/Lima'  check in (las 8 de arriba)
brands.metodo_manual  text not null default 'yape'  check in (yape,nequi,bizum,zelle,usdt,transferencia)
check (metodo_manual/moneda compatibles, tabla de arriba)
trigger guard_brand_moneda: moneda no cambia si la marca tiene un evento
trigger en events (before insert): select 1 from brands where id = new.brand_id for share
grant select (moneda, zona_horaria, metodo_manual) to anon, authenticated
```
Sin escritura para anon/authenticated (0081 ya la quitó en brands): escriben
las server actions con service role.

## Tareas (por bloques; commit después de cada uno)
### Bloque 1 — base y dinero mostrado
- [x] 1. 0088 + dryrun + aplicar + `e2e/pais-0088.mjs` (JWT real: anon lee las 3
  columnas y no escribe; trigger rechaza cambiar moneda con un evento (y la carrera evento+cambio se serializa); CHECK
  rechaza yape+COP). **Listo:** test verde, demotest queda en PEN/yape.
- [x] 2. `lib/moneda.ts`: `formatMoney(cents, moneda)` (Intl, sin decimales en
  CLP/COP o si son .00) y `aCentavos(input, moneda)`; `formatPEN` queda como
  `formatMoney(c,'PEN')` para no romper nada. Pasar la moneda de la marca en
  TODO lo que muestra plata de entradas (comprador, correos al comprador, panel,
  cabina por marca) y quitar los "S/" escritos a mano. Packs NO se tocan.
  **Listo:** tsc, test unitario de formatMoney, grep sin "S/" suelto fuera de
  packs/landing, fase1 verde (PEN idéntico byte a byte).
### Bloque 2 — hora de la marca
- [x] 3. `lib/zona.ts`: `formatEnZona(d, opts, tz)` y `localAUtc(local, tz)` (offset
  con Intl, sirve con horario de verano). eventValidation y el asistente usan la
  zona de la marca en vez de `-05:00`; formatLima pasa a formatEnZona con la
  zona de la marca en las páginas de la marca. **Listo:** test unitario con
  Madrid en verano/invierno y Lima; fase1 verde.
### Bloque 3 — país y medio manual
- [ ] 4. Mi marca: "País" (selector; cambia moneda+zona; bloqueado con aviso si
  ya hay órdenes) y "Cómo te pagan": medio manual según el país + cuenta +
  titular/red + QR, validado con lib/metodoManual.ts. Cabina igual.
  **Listo:** panel-en + capturas 390/1440.
- [ ] 5. Comprador: página de pago con el nombre del medio, cuenta, titular/red,
  QR y monto en su moneda; checkout rechaza medio incompatible con la moneda y
  no ofrece Tarjeta fuera de PEN. Panel/correos "Pagos por aprobar".
  **Listo:** `e2e/pais-compra.mjs` con una marca is_test TEMPORAL (demotest
  tiene eventos y su moneda ya no cambia): COP+Nequi, evento con precio
  entero, compra, comprobante, aprueba, entrada y correo en COP; Tarjeta
  rechazada aunque se llame a la acción; medio bloqueado con un pago por
  aprobar; se borra al final.
- [ ] 6. security-reviewer + Codex review. **Listo:** bugs reales corregidos.

## Fuera de alcance
Conversión de monedas, varias monedas por marca, varios medios manuales a la
vez, cripto automática (pasarela), PayPal de entradas, Stripe, varias zonas de
EE. UU., traducir el sitio del comprador, cambiar los packs.

## Bloqueos
(ninguno)
