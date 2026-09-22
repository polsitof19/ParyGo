---
name: ParyGo
description: Papel cálido, tinta marrón y hairlines; el color solo aparece cuando hay algo que hacer.
colors:
  paper: "#FBF7F0"
  paper-2: "#F4EDE1"
  paper-3: "#EFE6D6"
  surface: "#FFFFFF"
  ink: "#231C17"
  ink-2: "rgba(35, 28, 23, 0.70)"
  ink-3: "rgba(35, 28, 23, 0.66)"
  line: "rgba(35, 28, 23, 0.13)"
  sel: "rgba(35, 28, 23, 0.05)"
  accent: "#FF6A3D"
  accent-deep: "#E8552A"
  peri: "#5B6CFF"
  ok: "#2E9E6B"
  warn: "#C7791A"
  alert: "#D7472F"
typography:
  display:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  section:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  meta:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.10em"
  stat:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  hero:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "56px"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.04em"
rounded:
  ctl: "9px"   # --r-ctl
  btn: "10px"  # --r-btn

  card: "14px"
  pill: "999px"
spacing:
  s1: "8px"
  s2: "16px"
  s3: "24px"
  s4: "32px"
  s5: "48px"
  s6: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.btn}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-deep}"
    textColor: "{colors.ink}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.btn}"
    padding: "0 2px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.btn}"
    padding: "0 18px"
    height: "44px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "0px"
    padding: "0 2px"
    height: "44px"
  row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "0px"
    padding: "5px 0"
    height: "48px"
---

# Design System: ParyGo

<!--
  Documentado el 2026-09-22 desde el código real, no desde una propuesta:
  los valores salen de apps/web/app/styles/parygo-tokens.css y parygo-panel.css,
  y las proporciones de benchmarks MEDIDOS con Playwright.

  AUTORIDAD: CLAUDE.md manda sobre este archivo. Si algo acá lo contradice, es
  un error de este archivo. Los tests que hacen cumplir esto —y que fallan el
  build— son `npm run test:contrast` y `npm run test:tokens`.
-->

## Overview

Papel cálido y tinta marrón, no blanco y negro. La estructura la hacen tres
cosas: hairlines de 1px, jerarquía tipográfica y espacio. **Cero tarjetas
flotantes**: no hay rectángulos blancos con sombra sobre el papel.

El principio que gobierna todo: **el color aparece solo cuando hay algo que
hacer.** Cuando todo grita, nada señala.

## Colors

### Primary

`accent` **#FF6A3D** (tangerina). **Es DECORATIVO y nunca porta texto.** Vive
en puntos, barras de 4px, anillos de foco, rellenos sin texto encima.

El motivo no es estético: en las páginas públicas de cada marca el acento toma
el color que eligió el promotor, que puede ser cualquiera, y no hay forma de
garantizar contraste sobre un color arbitrario.

`accent-deep` **#E8552A** para el hover de relleno.

### Neutral

Papel en cuatro superficies, de más clara a más oscura: `paper` #FBF7F0,
`paper-2` #F4EDE1, `paper-3` #EFE6D6, `surface` #FFFFFF.

Tinta en tres niveles. **`ink-2` y `ink-3` son ALFA de la tinta, no grises hex**,
para que el contraste no dependa de sobre qué papel caigan. Medido sobre las
cuatro superficies; el peor caso siempre es `paper-3`. Piso para AA: alfa .630.
Los grises hex que traía la landing fallaban (#A89B8C daba 2.19:1).

### Named Rules

- **Botón primario = TINTA sobre acento** (5.91:1 medido). Blanco sobre naranja
  da 2.85:1 y falla AA: no se usa nunca.
- **Los semánticos (`ok`, `warn`, `alert`) fallan AA como texto sobre papel.**
  El texto de un estado va en `ink`; el color lo lleva el punto.
- `peri` #5B6CFF es decorativo puro: falla en los tres roles (texto 3.91, con
  blanco 4.17, con tinta 4.03). Solo blobs y puntos.
- **El color de marca nunca porta texto.** Lo único que lleva texto encima es el
  par que devuelve `brandFillPair()` (relleno + color de texto), medido a 4.5:1
  y verificado por test contra 14 colores de marca.
- **El hover de ese relleno también está medido**, y es OTRO COLOR
  (`brandFillHover()`), no un filtro. `filter: brightness()` mueve el relleno
  DESPUÉS de que el test midió el par: con #E91E63 el botón de pagar caía de
  4.58:1 a 4.20:1 justo cuando el comprador tenía el dedo encima.
- **`brandInk()` es el color de marca usado COMO texto** (el eyebrow y la cifra
  grande de los emails transaccionales). Su piso es AA 4.5:1 **contra
  `paper-3`**, la superficie más oscura. Medir contra blanco con umbral 2.8
  —como hacía— dejaba pasar el propio tangerina a 2.30:1 sobre paper-3.
- Excepción única y acotada: la palabra de acento del h1 de la landing
  (display ≥56px) usa `accent-deep`, medida 3.41:1 sobre el mínimo de 3:1 que
  WCAG pide para texto grande, y lleva un subrayado ondulado como segunda señal.

## Typography

Dos familias: **Bricolage Grotesque** para display, números y títulos;
**Hanken Grotesk** para cuerpo e interfaz.

### Hierarchy

Escala FIJA en variables CSS, sin `clamp` elástico. Móvil → escritorio:

| rol | tamaño | peso |
|---|---|---|
| título de página | 28 → 34 | 800 |
| título de sección | 20 → 24 | 700 |
| subtítulo | 16 | 700 |
| cuerpo | 16 → 17 (1.45) | 400 |
| meta | 13 | 400 |
| etiqueta | 11 mayúsculas, `0.10em` | 700 |
| número de stat | 26 → 28, tabular | 800 |

### La rampa por superficie

La tabla de arriba es la jerarquía de ROLES. Cada superficie la materializa en
variables, y **no quedan tamaños literales**: `npm run test:contrast` no lo
mide, pero el detector de impeccable sí, y en septiembre de 2026 pasó de 61
tamaños fuera de rampa a 0.

**Paneles** (`--s-*`, en `.pg-panel`): t1 28→34 · t2 20→24 · t3 16 ·
lead 18 · body 16→17 · ctl 15 · ui 14 · meta 13 · micro 12 · lb 11 · num 26→28 ·
**d1 40→56** (cifra héroe).

`d1` (2026-09-22) es la jerarquía por TAMAÑO que tienen las referencias
modernas (DICE separa display y cuerpo 5.9×, Shotgun 5.1×) y que al panel le
faltaba: todo se distinguía por peso 700/800 a tamaños parecidos. Hay **una
sola** cifra héroe por pantalla y es siempre **lo que espera al usuario**
(“5 Yapes”, “2 solicitudes”), nunca una métrica de vanidad: el número de lo
que ya pasó sigue en `num`. Interlineado .92, tracking -0.04em (el piso).

**Comprador** (`--b-*`, en `.client-shell`): t0 34 · t1 32→50 · t2 24→32 ·
t3 20→24 · price 18→21 · lead 17 · body 16→17 · ctl 15 · ui 14 · meta 13 ·
micro 12 · lb 11.

`lead`, `ctl`, `ui` y `micro` existen porque el texto de un control, el de
una fila secundaria y el de una nota al pie son tres cosas distintas, y antes
las tres se escribían como números sueltos entre 11.5 y 15.

### Excepciones documentadas

Son tres, y son las únicas:

1. **El tier display de la página de marca** (`--b-d1/2/3`, `clamp()`). Es la
   única tipografía FLUIDA del producto. Vale en `/b/[slug]` y en el cierre de
   la confirmación, que son pantallas de presentación. **En el checkout no**:
   un clamp en el precio hace que el mismo texto mida distinto en cada
   teléfono, que es justo lo que la escala fija vino a resolver.
2. **Los dos saltos de NOCHE** (`--bc3-display` 64, `--bc3-precio` 40), en
   `conceptos-prueba.css`. NOCHE es un concepto editorial y solo existe en las
   marcas de prueba.
3. **Los velos sobre foto** (ver más abajo, en Elevación).

### Named Rules

- **Los números son tabulares siempre** (`font-variant-numeric: tabular-nums`):
  precios, saldos, stats, montos. Una columna de números que baila es un error.
- **Las etiquetas van en mayúsculas espaciadas de 11px**, en `ink-3`, DEBAJO de
  su número.
- Todo el copy en **tuteo peruano**. Cero voseo.

## Layout

- **Contenedor de 1120px** en todo: paneles, compra y header del comprador.
  Medido contra siete dashboards públicos reales (mediana 859, banda 494–1152):
  1120 está en banda.
- Espacio en múltiplos de 8 (8/16/24/32/48/64).
- **Nada centrado.** Todo se alinea a la izquierda, incluidos los estados vacíos.
- Margen lateral `clamp(16px, 4vw, 32px)`.
- **Alto de fila 48px** (56 con avatar). El benchmark da 32, pero la fila entera
  es un link y su área de toque no puede bajar de 44: es lo más denso que
  permite el dedo, no lo más denso que permite la pantalla.
- **En el teléfono una tabla se vuelve lista** (`.s-table--stack`), nunca se
  desliza en horizontal: deslizar pierde las columnas de la derecha sin avisar.
- `100dvh`, no `100vh`: en Safari móvil 100vh es el viewport grande y deja la
  página más alta que lo visible.

### Orden de pantalla (2026-09-22)

Cada pantalla de panel se lee en tres franjas, siempre en este orden:

1. **Pendiente arriba.** Lo que espera al usuario va primero, con la cifra
   héroe (`.s-due`) y el ÚNICO primario de la pantalla. Si hay pendiente,
   “Crear evento” / “Crear marca” bajan a botón de texto; sin pendiente,
   vuelven a ser el primario. Las tareas secundarias van en líneas con punto
   (`.s-todo`). Nada pendiente se dice en voz baja (`.s-calm`, punto hueco).
2. **Información abajo.** Stats, tablas, listas. La plata primero.
3. **Lo raro, plegado** (`.s-fold`): archivados, rechazados, los datos de la
   marca. Están, pero no compiten.

Las **acciones frecuentes se ven sin abrir nada** (`.s-acts`): rejilla de filas
de 48px, dos columnas en el teléfono y cuatro en escritorio. Medido con
Playwright (`e2e/clics-paneles.mjs`): buscar comprador, reenviar entrada,
exportar asistentes y ventas por promotor quedan a 2 clics desde `/admin`.

## Elevation & Depth

**No hay elevación en los paneles.** La profundidad la dan los hairlines
(1px `line`) y el aire. Las sombras del token existen para superficies que no
son panel (el resultado de la puerta) y son de tinta, nunca de negro puro.

**Sobre papel, siempre `--shadow-sm/md/lg`.** Un `rgba(0,0,0,…)` sobre crema
se ve sucio; por eso los tokens son de tinta.

**Excepción: los velos sobre FOTO llevan negro puro.** El degradado del hero,
el contorno del nombre del evento encima del flyer y el fondo del visor a
pantalla completa **no** son sombras sobre papel: son máscaras de legibilidad
sobre una imagen que el promotor sube y que nosotros no controlamos. Un velo de
tinta cálida no oscurece lo suficiente un flyer claro y el nombre deja de
leerse. Cada uno de esos seis valores tiene el motivo escrito al lado en
`client.css`; son los únicos que el detector marca y se dejan marcados a
propósito.

Las barras superiores son de **papel sólido**, no vidrio esmerilado: con
translucidez el contenido se leía por debajo al scrollear en iPhone.

**Excepción de color: el banner de impersonación** (`.imp-banner`, índigo
#4338CA con texto blanco, 7.9:1). Está fuera de la paleta a propósito: avisa
que el super admin está mirando una marca en SOLO LECTURA, y tiene que verse
ajeno al panel para que nadie lo confunda con la marca. Son los cuatro valores
que el detector marca en los paneles, y se dejan marcados.

## Shapes

- Controles 9px, botones 10px, tarjetas 14px, pastillas 999px.
- **Los campos no son cajas**: línea inferior de 1.5px y nada más. Al enfocar,
  la línea se vuelve tinta y engorda; sin anillo ni relleno.
- Los bloques de sección no tienen borde cerrado ni radio: arrancan con un
  hairline superior.

## Components

### Buttons

**UN solo botón primario por pantalla.** El resto son botones de TEXTO: sin
relleno, sin borde, subrayado al pasar.

Todos miden **44px de alto reales**. Un botón de texto no se ve más grande por
medir 44: no hay caja que crezca, solo aire alrededor de la palabra.

El destructivo confirmado es tinta sólida con punto de alerta (15.7:1); blanco
sobre `alert` da 4.35:1 y no llega.

### Estados

Un estado es **un punto de color + texto en tinta**. Nunca texto de color.
`ok` listo · `warn` atención · `alert` problema · `accent` tarea pendiente ·
punto hueco = no pasa nada (borrador, archivado).

### Stats

Número grande (Bricolage 800, tabular) con la etiqueta de 11px en mayúsculas
espaciadas DEBAJO, columnas separadas por hairlines verticales.

El DOM va etiqueta → número y el orden VISUAL se invierte por CSS. Es una
divergencia consciente de WCAG 1.3.2: un lector de pantalla dice "Vendidas,
240" y quien ve la pantalla lee "240 / VENDIDAS". Ojo al leerlo con un script:
partir el `innerText` por espacios da vuelta los campos.

## Do's and Don'ts

**Do**

- Medir antes de afirmar. Contraste, proporciones y densidad salen de un script
  reproducible.
- Usar el punto de color para el estado y la tinta para el texto.
- Dejar que el hairline y el aire hagan la estructura.
- Diseñar para el teléfono de noche, con una mano.

**Don't**

- Poner texto sobre el acento o sobre el color de marca.
- Blanco sobre naranja (2.85:1).
- Más de un primario por pantalla.
- Centrar cosas.
- Tarjetas flotantes con sombra sobre el papel.
- Bajar `ink-2`/`ink-3` sin volver a medir contra `paper-3`.
- Deslizar tablas en horizontal en el teléfono.
