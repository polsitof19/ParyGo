# Compra moderna — tres direcciones

Exploración de diseño de la **página de compra** (hero + entradas + sticky).
Rama `design/moderno`. **No se mergea**: Paul elige.

## Cómo mirarlo

- **Página privada**: https://claude.ai/artifact/2SaESmcJ9G2HJKBayhFPE8
- **Local**: abrir `prototipo-compra.html` con doble clic.
- Teclas `1` `2` `3` o flechas para cambiar de dirección, `R` para repetir la
  animación de entrada. El botón de arriba a la izquierda cicla las tres marcas.
- La selección persiste en la URL: `?v=2&m=hoesky`.

## Por qué no hay URL de Cloudflare

El brief pedía un preview de Cloudflare. **El preview de este proyecto no
sirve nada.** El build compila (`design/moderno` → `75830515.parygo-app.pages.dev`,
estado Active), pero cada ruta devuelve el 404 propio de Cloudflare, incluido
`/` y hasta un archivo estático:

```
/icon.svg   preview 404   ·   parygo-app.pages.dev (canónico) 200
```

No es el build ni el middleware: el ambiente **Preview** del proyecto Pages no
tiene su configuración cargada, y eso es de dashboard. Mientras siga así,
ninguna rama va a poder previsualizarse.

## Las tres direcciones

| # | Nombre | Eje | Cuándo gana | Qué cuesta |
|---|---|---|---|---|
| 1 | **Editorial** | Manda la tipografía | El evento tiene nombre propio y el flyer es flojo o es una captura. El nombre vende, no la imagen. | Es la que más scroll pide: el flyer queda reducido a una banda y en escritorio los precios caen bajo el pliegue. |
| 2 | **Canvas** | Manda la imagen, la interfaz flota | El promotor sube buen arte. Es la más cercana a DICE y la que mejor entra en un teléfono: los dos tipos, las tres fases y los precios sin scroll. | **Depende del flyer.** Con una captura de Instagram —lo que sube media Lima— la página muestra la captura a sangre, con el "Seguir" y todo. Lo verificás en el prototipo con Hoesky. |
| 3 | **Entrada 2.0** | La metáfora del boleto, sin utilería | Querés conservar lo que la gente ya reconoce. Es la más densa y la que mejor tolera un flyer feo, porque lo recorta a 16:9. | Es la más conservadora: moderniza, no reencuadra. Si el problema es que "se ve viejo", esta lo mejora pero no lo cambia. |

Las tres conservan, sin excepción: precio visible sin scroll en 390, escalera de
fases con candados, un solo botón primario, copy en tú, línea de
responsabilidad del organizador, escala fija y la regla dura del acento (el
color de marca solo porta texto en el par medido de `brandFillPair`).

## Qué NO es

El CTA **no cobra**: al tocarlo dice que ahí seguiría el checkout real. Los
datos son un snapshot real de producción (solo lectura), no una sesión viva.

## Verificación

```
18/18 combinaciones (3 direcciones × 3 marcas × 390/1440)
  overflow 0 · un solo primario · área de toque ≥44 · consola limpia
  precio de entrada visible sin scroll a 390 en las tres
re-render quirúrgico: la imagen sobrevive al stepper, la animación de entrada
  corre 1 vez (al aparecer), no en cada incremento
detector de impeccable: 1 hallazgo (`cream-palette`) → manda CLAUDE.md
E2E fase 1 C/D/E en verde · la rama no toca una línea de apps/
```

## Archivos

`prototipo-compra.html` y `prototipo-artifact.html` se **generan**. Para
cambiar algo se editan las partes y se corre `node design_handoff_moderno/armar.mjs`:

| | |
|---|---|
| `proto-1-head.html` | tokens del sistema + el picker (copiado literal de la skill) |
| `proto-2-css.html` | lo compartido y los tres temas |
| `proto-3-body.html` | markup del harness + funciones de color portadas de `brandColors.ts` |
| `proto-4-render.html` | datos reales + render de las tres |
| `proto-5-wire.html` | cableado del picker y del stepper |
| `ADN-referencias-2026-09-22.md` | lo medido en DICE, Fever y Shotgun |

## Si elegís una

Se promueve a `apps/web/app/b/[brand]` reemplazando el concepto 2 y se borra
esta carpeta, como pide la skill. No antes.
