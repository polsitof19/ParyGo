# Benchmark de proporciones de los PANELES — 2026-09-21

Mismo método que el de la página de compra: no se miran capturas ni se copia a
ojo. Se abre el dashboard real con Playwright, se leen estilos computados y
rectángulos, y se saca la mediana. La misma función de medida corre sobre los
dashboards ajenos y sobre los nuestros (`tmp/paneles/medir.mjs`, importado por
`bench.mjs` y `bench-nuestro.mjs`), justamente para que no pueda divergir.

## Qué se pudo medir y qué no

Paul pidió Linear, Stripe, Vercel y Notion. **Los cuatro tienen el dashboard
detrás del login**, así que lo que se abre sin sesión es su sitio de marketing o
su documentación — superficies de producto, pero no paneles de datos. Se
midieron igual y quedaron aparte (grupo `pedido`), sin entrar en la mediana,
porque un `h1` de 72px de una home de marketing no dice nada sobre un panel.

La mediana sale de **siete dashboards de producto reales y públicos**, que sí
tienen números de stat y listas de datos de verdad:

| dashboard | qué es |
|---|---|
| Plausible (`plausible.io/plausible.io`) | su propia analítica, en vivo |
| Umami (demo público) | analítica |
| GitHub — repo | tabla de archivos, tabs, acciones |
| GitHub — issues | lista densa |
| Cloudflare Radar | stats + tablas |
| npm — página de paquete | tiles de stat |
| Grafana Play | dashboards de paneles |

Reproducir: `node tmp/paneles/bench.mjs 1440` y `node tmp/paneles/bench.mjs 390`.
Los JSON crudos, con el elemento del que salió cada medida, quedan en
`tmp/paneles/bench-1440.json` y `bench-390.json`.

## La tabla

**1440** (mediana de los siete; entre paréntesis, el rango):

| medida | dashboards | ParyGo ANTES | ParyGo AHORA | veredicto |
|---|---|---|---|---|
| columna de contenido | 859 (494–1152) | 1056 (1120 decl.) | igual | **en banda** |
| cuerpo | 16 | 16→17 decl. | igual | **en banda** |
| número de stat | 20 (19–36) | 26→28 | igual | **en banda** |
| alto de fila de tabla | 32 (30–41) | **70** | **56** (marcas) · 45 (tipos) | corregido |
| relleno vertical de celda | 0 (0–1,5) | 12 | 8 | corregido |
| alto de botón | 34 | 44 | 44 | **a propósito más alto** |
| cuerpo del botón | 14 | 14 | 14 | en banda |
| radio del botón | 6 | 10 | 10 | en banda |
| hueco entre secciones | 20 (12–30) | **56** | **32** | corregido |

**390**: contenedor 358 (= 390 − 16 de margen por lado, idéntico al nuestro),
cuerpo 16, stat 20, fila 40,5, botón 34, hueco 16. Nuestras filas medían 75–110
porque en el teléfono se partían en dos renglones; ahora 48.

## Qué se cambió y qué no

**Lo único que estaba fuera de banda era la DENSIDAD.** El tamaño de la letra,
el ancho de la columna, el tamaño de los números y el radio de los botones ya
estaban donde está un dashboard profesional, así que no se tocaron: el
benchmark sirve tanto para cambiar como para dejar quieto, y la mitad de su
valor es esto último.

Se cambiaron dos cosas, las dos medidas:

1. **Filas** — 70 → 56 en la tabla de marcas (el relleno de celda bajó de 12 a
   8; el piso lo pone el avatar de 40, no el relleno). Las filas de menú
   (`.s-event-row`) quedaron en 48.
2. **Aire entre secciones** — 56 → 32 (`.s-card` pasó de 24 a 16 de relleno
   superior, y el margen entre bloques de 32 a 16).

## Dos desvíos deliberados del benchmark

Los dos son por el dedo, no por gusto:

- **Botón 44, no 34.** 34px es lo normal en un dashboard de escritorio con
  mouse. Estos paneles se usan en un teléfono, en la puerta de un evento: 44 es
  el mínimo para tocar. El benchmark manda en escritorio; el dedo manda arriba
  del benchmark.
- **Fila 48, no 32.** La fila entera es un link. Una fila de 32 es un target de
  32. Por eso 48 es el piso: lo más denso que permite el dedo, no lo más denso
  que permite la pantalla.

Y un tercero, por el sistema:

- **Hueco 32, no 20.** Acá no hay cajas ni fondos separando secciones: el
  hairline y el aire SON la estructura. Por debajo de ~24 el hairline se lee
  como raya de tabla en vez de corte de sección. 32 es la mitad de lo que
  había y el doble de apretado de lo que se sentía.
