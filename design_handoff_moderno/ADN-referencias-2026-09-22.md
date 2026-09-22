# ADN de las tres referencias (medido, no mirado)

Extraído con el extractor de la skill `taste` a 1440×900, con Playwright local
(el MCP no estaba cargado). Datos crudos en `tmp/audit/{dice.fm,feverup.com,
shotgun.live}.json`. Los tres cargaron el sitio real: 34/23, 86/58 y n/n
botones e imágenes — ninguno es un muro de bot-detection.

| | DICE | Fever | Shotgun |
|---|---|---|---|
| familias | Favorit 1380 + Foggy 10 | **Montserrat sola** 450 | Space Grotesk 224 + monumentExtendedBlack 19 |
| display | **106px / lh 88** (ratio .83) | 48 / 56 (ratio 1.17) | **72 / 72** (ratio 1.00) peso 900 |
| cuerpo | 18 / 22 peso **350** | 16 / 24 peso 400 | 14 / 22.4 peso **500** |
| pesos | 400×335 · 350×30 · **700×14** | 400×55 · 600×53 | 500×35 · 700×18 · **900×17** |
| fondo | blanco | blanco | **#1C1C1C** |
| radios | 8 + **pastilla 40/100** | 16/8/38/24/50% (cinco mundos) | **4** + pastilla |
| botones | 16/400 pastilla, **sin mayúsculas** | 16/400 r4 MAYÚSCULAS | **12/700 r4 MAYÚSCULAS** |
| espaciado | 8×245 · **2×162** · 4×80 | 8×45 · 16×45 · 12×32 | 8×46 · 32×19 · 64×6 |
| contenedor | 1440 a sangre | 1440 a sangre | **1280 con tope** |
| reduced-motion | **no lo maneja** | sí | sí |

## Qué los hace modernos — diez líneas

1. **El tamaño hace la jerarquía, no el peso.** DICE separa display y cuerpo 5.9× y deja el 96% del texto en 400/350; Shotgun separa 5.1×. Ninguno "grita" con negritas.
2. **Dos familias con roles tajantes**: una neutral para todo y una rara solo para el display (Foggy, Monument Extended). La rara aparece 10 y 19 veces en toda la página.
3. **Interlineado del display por debajo de 1.0** (DICE .83, Shotgun 1.00). Es lo que hace que un titular se lea como cartel y no como párrafo grande.
4. **Una sola escala de espaciado, con un micro-escalón.** DICE usa 8 y además 2px para el ajuste fino entre línea y línea: densidad sin apretar.
5. **Dos mundos de radio, no cinco**: bloque chico (4–8px) y pastilla completa. Fever usa cinco y por eso se ve más viejo que los otros dos.
6. **El color es escaso y funcional.** Fondo neutro (blanco o casi negro), texto casi monocromo, y el color aparece en el botón y poco más.
7. **Contenedor ancho o a sangre**, con la foto llegando al borde. Nada de una caja centrada con márgenes iguales de los cuatro lados.
8. **Transiciones cortas y de una sola propiedad** (`color .15s`, `opacity .2s`), no `all`.
9. **Mayúsculas espaciadas para lo técnico** (etiquetas, botones secundarios), nunca para el mensaje principal.
10. **El foco se ve** en los tres (`focusVisible: true`): lo moderno incluye que se pueda usar con teclado.

## Qué NO copiar

- **El fondo negro de Shotgun.** ParyGo es papel cálido; el negro rompe la identidad y además invierte todos los contrastes medidos.
- **Los cinco mundos de radio de Fever**, y sus botones en MAYÚSCULAS de 16px: es lo que lo envejece.
- **Las tipografías de pago con carácter** (Foggy, Monument Extended). No las tenemos y sumar una tercera familia contradice el sistema.
- **DICE no maneja `prefers-reduced-motion`.** Nosotros sí, y no se negocia.
- **El peso 350 en cuerpo de 14px.** A ese tamaño sobre papel crema no llega; el 300 de Hanken se usa solo en prosa de 16px+ (ya documentado).
- **`transition: all`**, que Fever y Shotgun tienen igual.
- **El texto sobre foto sin velo medido.** Los tres lo hacen con fotos que ellos controlan; acá el flyer lo sube el promotor.
