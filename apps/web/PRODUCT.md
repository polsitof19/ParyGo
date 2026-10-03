# Product

<!-- impeccable:product-schema 1 -->

<!--
  Escrito el 2026-09-22 a partir de CLAUDE.md y del código, NO de una entrevista:
  la verdad de producto de ParyGo ya estaba documentada y verificada contra
  producción. Todo lo de acá es hecho confirmado en el repo o medido en la base
  de datos; lo que no está confirmado se marca como decisión abierta en vez de
  rellenarse.

  Fuente de verdad: CLAUDE.md en la raíz. Si algo de este archivo lo contradice,
  manda CLAUDE.md.
-->

## Platform

web

## Users

Tres roles, con contextos de uso muy distintos:

- **Super admin (Paul, el dueño de la plataforma).** Uno solo. Administra marcas,
  carga packs de saldo, mira la salud del sistema. Entra desde el escritorio y
  desde el teléfono. Su panel vive en un slug oculto (`/cabina-7k29x`), aunque
  el guard real es server-side.
- **Promotor / brand_admin.** Organiza fiestas en Lima. Arma el evento, sube el
  flyer, revisa los comprobantes de Yape uno por uno y cobra con SUS propias
  credenciales. Trabaja desde el teléfono la mayor parte del tiempo, incluso la
  noche del evento.
- **Validador (puerta).** Escanea QR en la entrada, de noche, con una mano
  ocupada y a un brazo de distancia de la pantalla. Tiene un código personal de
  8 caracteres para trazabilidad por persona.
- **Comprador.** NO se registra ni se loguea. Llega por un link o por el
  subdominio de la marca, elige entradas, paga (Yape o tarjeta) y recibe su QR
  por email. Es la mayoría del tráfico y es casi todo móvil.

## Product Purpose

SaaS multi-tenant de venta de entradas para eventos urbanos en Lima. Cada
promotor es una "marca" con su propio subdominio `<slug>.parygo.com`.

El modelo de negocio define el producto: **ParyGo cobra S/200 planos por evento
(packs de saldo) y NUNCA toca la plata de las entradas.** El promotor cobra con
sus propias credenciales de Yape y de MercadoPago, y el dinero va directo a su
cuenta. Éxito = el promotor cobra sin fricción y el comprador entra al evento
con su QR sin haber tenido que crear una cuenta.

## Positioning

Lo que un competidor no puede copiar sin cambiar su negocio: **la plata de las
entradas nunca pasa por ParyGo.** No hay comisión por ticket, no hay retención,
no hay plazo de liquidación. El promotor cobra en su Yape al instante y ParyGo
factura aparte por evento. Eso obliga a que cada marca cargue sus propias
credenciales de cobro, y es la razón de que el producto sea multi-tenant hasta
en la pasarela de pago.

Segundo diferenciador, consecuencia del primero: **el comprador no se registra.**
Ni cuenta, ni contraseña, ni app. La entrada es una URL con un UUID.

## Operating Context

- **Lima, Perú. Zona horaria America/Lima (UTC-5, sin DST).** Todas las fechas
  del producto se piensan en hora de Lima; las fases de preventa cortan a las
  23:59 de Lima, no a medianoche UTC.
- **Yape es el medio de pago real.** Es una app de transferencia entre teléfonos
  que no tiene API: el comprador transfiere, saca captura del comprobante y la
  sube; el promotor la revisa a mano contra su propia app de Yape (monto, N° de
  operación y nombre) y aprueba o rechaza. Ese circuito manual es el que cobra
  hoy y no es una deuda técnica: es como se paga en este mercado.
- **MercadoPago existe como segunda opción** (tarjeta, cobro instantáneo) y solo
  aparece si la marca cargó sus credenciales.
- **La noche del evento.** El validador escanea en la puerta, con poca luz, a
  veces sin señal (hay modo offline). Un QR se escanea UNA sola vez: el segundo
  intento dice "YA USADO" y no pasa, porque un QR reenviado por WhatsApp no
  puede entrar dos veces.
- **El promotor trabaja desde el teléfono**, incluido revisar los Yapes que
  llegan mientras vende.

## Capabilities and Constraints

Confirmado y en producción:

- Eventos con fases de preventa automáticas: el precio activo lo resuelve la
  base contra `now()` y se CONGELA en la orden al comprar.
- **Los montos son siempre server-side.** El cliente manda tipo y cantidad,
  nunca importe. Es una regla dura, no una preferencia.
- Anti-sobreventa atómico: la reserva de cupo toma lock de fila, así que dos
  compras simultáneas del último lugar dan una ganadora y una rechazada.
- Códigos promo por evento (porcentaje, monto fijo, gratis) con tracking por
  RR.PP.
- Cortesías: emisión gratuita desde el panel, sin pago, con tope de cupo.
- Eventos gratis (entrada libre con registro), distintos de las cortesías.
- Transferencia de entradas entre compradores, configurable por evento.
- Emails transaccionales (entrada con QR, recordatorio, cancelación, postergación).

Restricciones técnicas que condicionan el diseño:

- **Runtime edge (Cloudflare Pages).** No hay Node completo del lado del server.
- Base única de Postgres (Supabase) con RLS; es a la vez producción y el único
  entorno. No hay base de ensayo.
- Multi-tenant por subdominio, resuelto por un Worker.

Terminología del producto (usar estas palabras, no sinónimos):

- **marca** = el promotor como tenant. No "cliente", no "organización".
- **saldo de eventos** = los packs que compra el promotor. Se consume 1 al crear.
- **cortesía** = entrada de invitado, nunca pública.
- **evento gratis** = evento cuya entrada no se cobra, sí público.

Decisiones abiertas (NO inventar una respuesta):

- Reingreso configurable por tipo de entrada (hoy: un escaneo y listo).
- Carga del `mp_webhook_secret` desde la UI: hoy requiere un UPDATE manual, y
  sin eso MercadoPago no liquida.

## Brand Commitments

- Nombre: **parygo**, en minúsculas, con el punto final como parte del wordmark
  (`parygo.`). El punto va en el color de acento; es la única excepción
  documentada de acento sobre texto.
- Dos familias tipográficas: Bricolage Grotesque (display) y Hanken Grotesk
  (cuerpo).
- **Todo el copy va en tuteo peruano** (tú, cercano). Cero voseo: suena
  argentino y rompe la cercanía. Es una decisión de marketing, ya aplicada sobre
  83 archivos y verificada en producción.
- El color de marca lo elige CADA promotor y se aplica a su página pública. Por
  eso el sistema no puede apoyar texto sobre él sin medir contraste.
- Identidad cálida: papel crema, tinta marrón oscura, nunca negro puro.

## Evidence on Hand

- **CLAUDE.md** (raíz): las reglas duras del proyecto, verificadas. Es la
  autoridad por encima de este archivo.
- **Sistema de diseño**: `apps/*/app/styles/parygo-tokens.css` (fuente única de
  tokens, duplicada a propósito entre las dos apps con test que falla si
  divergen), `apps/web/app/styles/parygo-panel.css` (paneles),
  `apps/web/app/b/[brand]/client.css` (comprador), `apps/web/app/scan/scan.css`
  (puerta).
- **Benchmarks MEDIDOS, no estimados**:
  `design_handoff_refresco_paneles/BENCHMARK-paneles-2026-09-21.md` (siete
  dashboards públicos reales con Playwright) y las proporciones de la página de
  compra medidas contra DICE, Fever, Joinnus y Teleticket.
- **Tests que corren**: `npm run test:contrast` (incluye el par de color de
  marca contra 14 colores y la paleta de la puerta), `test:tokens`,
  `test:redirects`, y el E2E completo en `e2e/fase1.mjs` (A→K).
- **Auditoría de iPhone versionada**: `e2e/audit-iphone.mjs`, WebKit real a
  390x844 y 430x932 sobre 26 vistas.
- Cliente piloto real: "Tío Code". La venta real probada en producción es la de
  "hoesky". **No hay testimonios, casos de éxito, métricas de adopción ni
  prensa: no inventarlos.**

## Product Principles

1. **La plata del promotor no pasa por acá.** Cualquier decisión que acerque a
   ParyGo a retener fondos cambia el negocio, no solo el producto.
2. **El comprador no se registra.** Nada de lo que se diseñe puede requerir una
   cuenta para comprar o para entrar al evento.
3. **El importe lo decide el servidor, siempre.** El cliente nunca manda un
   precio; si una pantalla necesita un total, lo pide.
4. **Se diseña para el teléfono de noche**, no para el escritorio de día: la
   puerta, la revisión de Yapes y la compra ocurren desde un celular, muchas
   veces con una sola mano.
5. **Lo que se afirma, se mide.** Contraste, proporciones y densidad salen de
   una medición reproducible, no de criterio. Si no hay número, no es una regla.

## Accessibility & Inclusion

- **AA (4.5:1) es piso, no aspiración**, y está cubierto por tests que fallan el
  build: `check-tokens-contrast`, `check-brand-contrast` (el par de relleno de
  marca contra 14 colores), `check-variant-contrast` y `check-scan-contrast`.
- **El color nunca porta el mensaje solo.** Un estado se dice con un punto de
  color MÁS texto en tinta; el acento y el color de marca no llevan texto encima.
- **Área de toque mínima de 44px** en todo control suelto. Excepción aceptada y
  documentada: un link dentro de una oración conserva el alto de su renglón
  (WCAG 2.5.8 exime los targets "en una oración o bloque de texto").
- `prefers-reduced-motion` apaga toda la animación del producto.
- La puerta se usa de noche: su pantalla de resultado prioriza legibilidad sobre
  estética (rótulo de 34-52px, texto blanco sobre tonos medidos a ≥4.5:1).
