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
rounded:
  ctl: "9px"
  btn: "10px"
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

## Elevation & Depth

**No hay elevación en los paneles.** La profundidad la dan los hairlines
(1px `line`) y el aire. Las sombras del token existen para superficies que no
son panel (el resultado de la puerta) y son de tinta, nunca de negro puro.

Las barras superiores son de **papel sólido**, no vidrio esmerilado: con
translucidez el contenido se leía por debajo al scrollear en iPhone.

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
