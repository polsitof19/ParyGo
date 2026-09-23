---
name: ParyGo
description: Papel cálido solo en la landing; compra y paneles (organizador y super admin) en tema noche, negro neutro. El color solo aparece cuando hay algo que hacer.
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
  # — Tema noche (2026-09-23): comprador (b/[brand]/*) Y los paneles
  #   (organizador + super admin), montado con `pg pg-noche`. Fondo y tinta
  #   NEUTROS, nunca crema. Ver la sección "Tema noche" para el resto
  #   (--selected, --on-white, --white-hover, --material, --veil).
  noche-bg: "#0A0A0A"
  noche-surface: "#141414"
  noche-surface-2: "#1C1C1C"
  noche-selected: "#202020"
  noche-ink: "#FFFFFF"
  noche-ink-2: "#A3A3A3"
  noche-ink-3: "#8A8A8A"
  noche-line: "rgba(255, 255, 255, 0.12)"
  noche-on-white: "#0A0A0A"
  noche-white-hover: "#E6E6E6"
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

Dos mundos, según la superficie. La **landing** (y los emails que no son de
entrada) sigue en papel cálido y tinta marrón, no blanco y negro. **Compra y
paneles** (organizador `/admin` y super admin `/cabina-7k29x`) van en **tema
noche**, negro neutro — desde el 2026-09-23 los paneles dejaron el papel y se
sumaron al mismo tema noche del comprador. Todo lo de esta página que hable
de "papel" sin aclaración es la landing; lo de los paneles y la compra está en
la sección **Tema noche**, más abajo.

En las dos superficies la estructura la hacen tres cosas: hairlines de 1px,
jerarquía tipográfica y espacio. **Cero tarjetas flotantes**: no hay
rectángulos con sombra sobre el papel ni sobre el negro.

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

**Vale para la landing** (y los emails que no son de entrada). Compra y
paneles usan la paleta neutra de tema noche, ver más abajo.

Papel en cuatro superficies, de más clara a más oscura: `paper` #FBF7F0,
`paper-2` #F4EDE1, `paper-3` #EFE6D6, `surface` #FFFFFF.

Tinta en tres niveles. **`ink-2` y `ink-3` son ALFA de la tinta, no grises hex**,
para que el contraste no dependa de sobre qué papel caigan. Medido sobre las
cuatro superficies; el peor caso siempre es `paper-3`. Piso para AA: alfa .630.
Los grises hex que traía la landing fallaban (#A89B8C daba 2.19:1).

### Named Rules

- **Botón primario = TINTA sobre acento** (5.91:1 medido), en la **landing**.
  Blanco sobre naranja da 2.85:1 y falla AA: no se usa nunca. En los paneles
  y la compra (tema noche) el primario ya no lleva el acento: ver Botones,
  más abajo.
- **Los semánticos (`ok`, `warn`, `alert`) fallan AA como texto sobre papel.**
  El texto de un estado va en `ink`; el color lo lleva el punto. Vale igual
  en tema noche: el texto de un estado va en `--ink`, nunca en el color.
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

**En la landing**, dos familias: **Bricolage Grotesque** para display, números
y títulos; **Hanken Grotesk** para cuerpo e interfaz. **En compra y paneles**
(tema noche) la familia es una sola: **Geist** (paquete `geist`, `next/font/local`)
en todo — títulos, números, cuerpo y etiquetas. Sin Bricolage ni Hanken ahí.

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

**Paneles** (`--s-*`, en `.pg-panel`): desde el 2026-09-23 comparten el tema
noche del comprador (Geist, peso 600 en vez de 800, etiquetas en minúscula
normal en vez de mayúsculas espaciadas). Su rampa propia, distinta de la del
comprador, está documentada en la sección **Tema noche**, más abajo, junto con
el resto de los tokens de esa superficie.

`d1` (2026-09-22, sigue vigente en tema noche como `--s-d1` 40→56) es la
jerarquía por TAMAÑO que tienen las referencias modernas (DICE separa display
y cuerpo 5.9×, Shotgun 5.1×) y que al panel le faltaba: todo se distinguía por
peso a tamaños parecidos. Hay **una sola** cifra héroe por pantalla y es
siempre **lo que espera al usuario** (“5 Yapes”, “2 solicitudes”), nunca una
métrica de vanidad: el número de lo que ya pasó sigue en `num`.

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
  su número — en la **landing**. En tema noche (compra y paneles) las
  etiquetas van en minúscula NORMAL, 11–13px según la superficie: nada de
  mayúsculas espaciadas ni eyebrows sobre títulos, era la firma del dashboard
  generado.
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

1. **Pendiente arriba.** Lo que espera al usuario va primero, en `.s-due` —
   el ÚNICO bloque con fondo (`--surface`) de la pantalla, punto de acento,
   qué es y por qué importa, con el ÚNICO primario de la pantalla a la
   derecha (2026-09-23: ya no es una cifra héroe de 56px suelta; es la fila
   con fondo de la referencia aprobada). Si hay pendiente, “Crear evento” /
   “Crear marca” bajan a botón de texto; sin pendiente, vuelven a ser el
   primario. Las tareas secundarias van en líneas con punto (`.s-todo`). Nada
   pendiente se dice en voz baja (`.s-calm`, punto hueco).
2. **Información abajo.** Stats, tablas, listas. La plata primero.
3. **Lo raro, plegado** (`.s-fold`): archivados, rechazados, los datos de la
   marca. Están, pero no compiten.

Las **acciones frecuentes se ven sin abrir nada** (`.s-acts`): rejilla de filas
de 48px, dos columnas en el teléfono y cuatro en escritorio. Medido con
Playwright (`e2e/clics-paneles.mjs`): buscar comprador, reenviar entrada,
exportar asistentes y ventas por promotor quedan a 2 clics desde `/admin`.

## Elevation & Depth

**No hay elevación en los paneles**, ni en la compra. La profundidad la dan
los hairlines (1px `line`) y el aire. Desde el 2026-09-23, con los paneles en
tema noche, esto ya no es solo una convención: `.pg.pg-noche` pisa
`--shadow-sm/md/lg` a `none` — sobre negro no hay sombra que leer, la
profundidad la hace la superficie (`--surface` #141414 sobre `--bg` #0A0A0A)
y el borde `--line`.

**Sobre papel (la landing), siempre `--shadow-sm/md/lg`.** Un `rgba(0,0,0,…)`
sobre crema se ve sucio; por eso esos tokens son de tinta, nunca de negro
puro.

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

## Tema noche: comprador y paneles (2026-09-23)

El comprador (`b/[brand]/*`: compra, datos, Yape, confirmación, /pedido,
/t/[uuid] y la home de marca) y, desde el 2026-09-23, **los dos paneles**
(organizador `/admin` y super admin `/cabina-7k29x`, montados con
`pg pg-noche pg-panel`) van en **negro neutro**, con el tema `pg-noche` de
parygo-tokens.css. Regla de fondos: blanco #FFFFFF o negro #0A0A0A, nunca
crema ni marrón. Todo lo de "papel" de arriba sigue valiendo SOLO para la
landing (y los emails que no son de entrada) — ya NO para el comprador ni
para los paneles.

Comprador y paneles comparten exactamente los mismos tokens de color y la
misma familia (Geist); lo que cambia entre los dos es la rampa tipográfica
propia de cada uno (`--b-*` en el comprador, `--s-*` en los paneles) y sus
componentes. Esta sección cubre primero los tokens compartidos, después lo
propio del comprador, y por último lo propio de los paneles.

| Token | Valor | Uso |
|---|---|---|
| `--bg` | #0A0A0A | página |
| `--surface` | #141414 | filas de entrada, tarjetas, campos |
| `--surface-2` | #1C1C1C | mapa, iconos de pasos |
| `--selected` | #202020 | fila elegida |
| `--ink` | #FFFFFF | texto |
| `--ink-2` | #A3A3A3 | secundario (≥ 6.46:1) |
| `--ink-3` | #8A8A8A | etiquetas (≥ 4.72:1; #7A7A7A fallaba) |
| `--line` | rgba(255,255,255,.12) | bordes |
| `--on-white` | #0A0A0A | texto sobre un relleno blanco (botón primario, `+` del stepper) |
| `--white-hover` | #E6E6E6 | hover del relleno blanco (16.5:1) |
| `--accent` | #FF6A3D | el mismo naranja parygo de siempre, decorativo (punto, pastilla de contador) |
| `--brand-mark` | brandMark(hex) | **solo comprador**: punto, barra de 3px, foco (≥ 3:1 sobre #0A0A0A) |
| `--brand-fill`/`--on-fill` | brandFillPair(hex,'neutra') | **solo comprador**: el ÚNICO texto sobre la marca |

Los paneles no tienen concepto de "marca" propia: su acento siempre es
`--accent` (#FF6A3D), nunca `brandMark`/`brandFillPair` — esos dos son del
comprador, donde el color lo elige el promotor.

### El comprador

**Tipografía:** Geist (paquete `geist`, next/font/local) en todo; ni
Bricolage ni Hanken. Escala FIJA: h1 40/.95/800 −0.04em en teléfono y
76/.9/800 −0.05em desde 1024; títulos internos 32/.98/800; total 22/800;
precio 18/700 tabular; cantidad 17/700; cuerpo 15–16/1.5; secundario
12.5–13; etiquetas 11 mayúsculas .1em 500 en `--ink-3`. Sin serif ni
itálica.

**Piezas (maqueta aprobada):** cabecera de 56 con el logo real a 26 de alto;
banda de 216 (radio 16) con el flyer entero sobre su copia difuminada
(blur 28, brillo .55); filas `--surface` radio 14, elegida en `--selected`
con barra de 3px; stepper de 42 (− borde blanco .22, + relleno blanco);
barra de pagar de 86, rgba(10,10,10,.72) + blur(20) saturate(180%);
escritorio 360 / fluido / 320 en 1120 con el flyer a 360×450; campos de 48
radio 12, foco borde blanco .45 + anillo blanco .08; entrada en tarjeta
BLANCA radio 20 con franja de 8px de la marca y QR de 216.

**Motion:** una curva, `cubic-bezier(0.23, 1, 0.32, 1)`. Solo transform y
opacity. Entrada escalonada solo en la primera carga (0/60/120/200/280/360,
320ms). Botones 160ms, `:active` scale(.97) en 100ms. El número del stepper
entra de scale(.96)/opacity .5 en 160ms, sin rebote, y la fila NO se
remonta. Barra de selección scaleY .4→1 en 160ms. QR scale(.95)+opacity en
400ms, una vez. Hovers solo con `(hover: hover) and (pointer: fine)`; los
links bajan a opacity .7, nunca al color de la marca. `prefers-reduced-motion`
= fundido de 200ms sin desplazamiento (no `animation: none`).
`prefers-reduced-transparency` = barra y cabecera sólidas.

**Excepción que sigue vigente:** el flyer difuminado con brightness(.55)
detrás de la banda es una máscara sobre una FOTO ajena, no una sombra.

### Los paneles (organizador y super admin)

Referencia aprobada por Paul el 2026-09-23 ("Panel organizador ParyGo.html").
Montan `pg pg-noche pg-panel admin-shell` (organizador) o
`pg pg-noche pg-panel super-shell` (super admin). Mismos colores que el
comprador (tabla de arriba); tipografía Geist en todo, **peso 600 donde el
sistema de papel usaba 800** (no queda ningún 800 en los paneles); etiquetas
en minúscula normal, nunca mayúsculas espaciadas ni eyebrows sobre títulos.

**Rampa propia** (`--s-*`, en `.pg-panel`), teléfono → escritorio (≥1024,
salvo donde se anota otro punto de quiebre):

| Token | Tamaño | Peso | Uso |
|---|---|---|---|
| `--s-t1` | 26 → 36 | 600, −0.03em | título de página (`.s-h1`) |
| `--s-t2` | 20 → 22 | 600, −0.02em | título de sección (`.s-h2`, `.s-card__title`) |
| `--s-t3` | 16 (fijo) | 600, −0.01em | subtítulo (`.s-h3`) |
| `--s-body` | 15 (fijo) | 400 | cuerpo |
| `--s-lead` | 18 (fijo) | 600 | entradilla / cifra en línea |
| `--s-ctl` | 15 (fijo) | 400–600 | texto de control (botón, campo, opción) |
| `--s-ui` | 14 (fijo) | 400–500 | interfaz secundaria |
| `--s-meta` | 13 (fijo) | 400–500 | meta, subtítulos chicos |
| `--s-micro` | 12 (fijo) | 400–500 | microcopy (pie, nota al pie de tabla) |
| `--s-lb` | 13 (fijo) | 500, minúscula | etiqueta de grupo (`.s-acts__k`, `.s-section-lead`) |
| `--s-num` | 22 → 26 | 600, tabular, −0.02em | número de stat |
| `--s-field` | 16 (fijo) | 400 | texto dentro de un campo (16 = iOS no hace zoom al enfocar) |
| `--s-cifra` | 20 (fijo) | 600, tabular | las tres cifras del evento que viene |
| `--s-hero` | 24 → 36 (≥900) | 600, −0.025em/−0.03em | nombre del evento que viene, el título más grande de la home |
| `--s-word` | 19 (fijo) | 700, −0.03em | wordmark "parygo." del super admin |
| `--s-d1` | 40 → 56 | 600 | cifra grande suelta (p. ej. el código de puerta en `.a-code--lg`) |

Espacio en múltiplos de 8 (`--s-s1`…`--s-s6` = 8/16/24/32/48/64), contenedor
de 1120, igual que en el resto del sistema.

**Componentes propios de esta superficie:**

- **Botones.** Primario: relleno `--ink` (blanco) con texto `--on-white`
  (#0A0A0A, 19.8:1 medido), radio `--r-btn` (10), alto **48** (antes 44).
  Hover = `--white-hover` #E6E6E6 (16.5:1), nunca un filtro. Secundario
  (`.s-btn--soft`): el mismo botón sin relleno, con borde blanco al 16%
  (`.34` al pasar). Ghost (`.s-btn--ghost`): solo texto, subrayado al pasar.
  Destructivo confirmado (`.s-btn--danger`): relleno `--ink` con punto de
  alerta, es el primario de SU paso. Un solo primario por pantalla, igual
  que en el resto del sistema.
- **Campos** (`.s-input`). Caja de 48 de alto, borde blanco al 14%, radio
  `--r-btn` (10, no `--r-ctl`), texto en `--s-field` (16px). Foco: el borde
  sube a blanco 45% + anillo de 3px blanco al 8%. Ya no es una línea inferior
  como en el sistema de papel: acá el campo SÍ es una caja.
- **`.s-due`.** La única fila con fondo (`--surface` #141414, radio
  `--r-ctl` = 12 en este tema) de toda la pantalla: punto de acento, qué es
  y por qué importa, con la acción a la derecha. Reemplazó a la cifra héroe
  de 56px que tenía antes (2026-09-23): la etiqueta "Por revisar" queda solo
  para el lector de pantalla.
- **Navegación.** Barra LATERAL de 248px fija a la izquierda desde 900px
  (filas de 44, la activa con fondo `--surface`); en el teléfono, cabecera
  de 60 arriba y barra FIJA abajo (`.s-tabbar`, ítems de ícono 22px + nombre
  de 11px, el activo con un punto de acento debajo). Mismo markup en los dos
  paneles. El contador (Yapes por revisar, solicitudes) es una pastilla de
  `--accent` con el número en `--on-white` (#0A0A0A, 7.0:1 medido) — el ÚNICO
  texto sobre el acento de todo el panel, y va en negro, nunca en blanco.
- **Acciones** (`.s-acts` / `.s-act`). Filas de **52** con ícono (18px,
  `--ink-2`) y chevron a la derecha, agrupadas por para qué sirven
  ("Asistentes" · "Venta" en el organizador): 1 columna en el teléfono, 2
  columnas desde 900px.
- **Motion.** El panel NO anima al cargar — solo `.s-notice` entra con
  fade de 240ms; el fade-up escalonado de filas (tabla, tarjetas de marca,
  filas de evento) se sacó a propósito: el organizador abre estas pantallas
  decenas de veces por día y es la firma visual del dashboard generado.
  TODO control presionable lleva `:active { transform: scale(.97) }` en
  140ms: el organizador trabaja desde el teléfono, donde `:hover` no existe,
  así que sin `:active` no hay ninguna señal de que el control recibió el
  toque. `prefers-reduced-motion` cambia la presión de `transform` a un
  `box-shadow` inset, nunca la saca del todo.

## Shapes

**Landing:** controles 9px, botones 10px, tarjetas 14px, pastillas 999px.
**Los campos no son cajas**: línea inferior de 1.5px y nada más. Al enfocar,
la línea se vuelve tinta y engorda; sin anillo ni relleno.

**Tema noche (compra y paneles):** botones 10px (sin cambio), tarjetas 14px
(sin cambio), pero **controles pasan a 12px** (`--r-ctl`, lo pisa
`.pg.pg-noche`) y **los campos SÍ son cajas**: borde de 1px blanco al 14%,
alto 48, foco con borde blanco 45% + anillo blanco 8%. Es la inversión
deliberada de la regla de la landing: sobre negro una línea sola no se lee
tan bien como una caja con borde tenue.

Los bloques de sección, en las dos superficies, no tienen borde cerrado ni
radio: arrancan con un hairline superior.

## Components

### Buttons

**UN solo botón primario por pantalla**, en TODAS las superficies. El resto
son botones de TEXTO: sin relleno, sin borde, subrayado al pasar.

**En la landing:** todos miden 44px de alto reales. Un botón de texto no se ve
más grande por medir 44: no hay caja que crezca, solo aire alrededor de la
palabra. El destructivo confirmado es tinta sólida con punto de alerta
(15.7:1); blanco sobre `alert` da 4.35:1 y no llega.

**En compra y paneles (tema noche):** el primario mide 48 de alto, relleno
`--ink` (blanco) con texto `--on-white` (#0A0A0A), hover `--white-hover`
#E6E6E6. En el comprador, si hay marca, el primario es el par de
`brandFillPair()`; en los paneles siempre es blanco/negro (ver el detalle
completo en **Los paneles**, dentro de Tema noche).

### Estados

Un estado es **un punto de color + texto en tinta**. Nunca texto de color.
`ok` listo · `warn` atención · `alert` problema · `accent` tarea pendiente ·
punto hueco = no pasa nada (borrador, archivado). Vale igual en las tres
superficies: papel, comprador y paneles.

### Stats

**En la landing:** número grande (Bricolage 800, tabular) con la etiqueta de
11px en mayúsculas espaciadas DEBAJO, columnas separadas por hairlines
verticales.

**En los paneles:** mismo patrón de columnas y hairlines, pero el número es
Geist **600** (no 800) y la etiqueta va en **12px minúscula normal** en
`--ink-2` (no mayúsculas espaciadas) — ver la rampa `--s-num`/`--s-micro` en
Tema noche.

En las dos, el DOM va etiqueta → número y el orden VISUAL se invierte por
CSS. Es una divergencia consciente de WCAG 1.3.2: un lector de pantalla dice
"Vendidas, 240" y quien ve la pantalla lee "240 / VENDIDAS". Ojo al leerlo
con un script: partir el `innerText` por espacios da vuelta los campos.

## Do's and Don'ts

**Do**

- Medir antes de afirmar. Contraste, proporciones y densidad salen de un script
  reproducible.
- Usar el punto de color para el estado y la tinta para el texto.
- Dejar que el hairline y el aire hagan la estructura.
- Diseñar para el teléfono de noche, con una mano — vale para el comprador
  Y para el organizador en la puerta.
- En los paneles, animar solo cuando algo cambió (`.s-notice`); nunca al
  cargar la pantalla.

**Don't**

- Poner texto sobre el acento o sobre el color de marca.
- Blanco sobre naranja (2.85:1).
- Más de un primario por pantalla.
- Centrar cosas.
- Tarjetas flotantes con sombra sobre el papel o sobre el negro.
- Bajar `ink-2`/`ink-3` sin volver a medir contra `paper-3` (landing) o
  contra `--selected` (tema noche).
- Mayúsculas espaciadas como etiqueta, ni peso 800, en los paneles: ahí el
  tope es minúscula normal y 600 — quedó atrás con el papel.
- Deslizar tablas en horizontal en el teléfono.
