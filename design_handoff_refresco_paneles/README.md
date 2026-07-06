# Handoff: Refresco de acabado — paneles ParyGo (super admin · admin · cliente)

## Overview
Este paquete describe un **refresco de acabado** (no un rediseño) de las tres superficies de ParyGo:

- **Super admin** — `apps/web/app/cabina-7k29x/` (CSS: `super.css`, scope `.super-shell`)
- **Admin de marca** — `apps/web/app/admin/` (CSS: `admin.css`, scope `.admin-shell`)
- **Cliente / comprador** — `apps/web/app/b/[brand]/` (CSS: `client.css`, scope `.client-shell`)

El objetivo es **afinar tipografía y espaciado** manteniendo intactos:
- la paleta cálida (crema `#FBF7F0` + tangerina `#FF6A3D` + peri `#5B6CFF`),
- las fuentes (`Bricolage Grotesque` display / `Hanken Grotesk` body),
- los layouts, la estructura de componentes y el comportamiento.

**No** se tocan colores de marca, no se agregan gradientes nuevos, no se agregan emojis.

## About the Design Files
El archivo `ParyGo · Refresco de paneles.dc.html` es una **referencia de diseño en HTML** (un prototipo del aspecto buscado), **no** código para copiar tal cual. La implementación real es editar los **tres archivos CSS ya existentes y scopeados** del codebase Next.js. Como son clases compartidas (`.s-h1`, `.s-card`, `.s-stat`…), cambiar el valor en un solo lugar propaga el refresco a TODAS las pantallas de esa superficie — por eso el trabajo es chico y de bajo riesgo.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciado y radios son finales. Recreá los valores exactos de las tablas *antes → después* de abajo.

## Cómo implementarlo (resumen para el dev)
1. La mayoría de los cambios viven en bloques de clases `s-*` que están **duplicados idénticos** en `super.css` y `admin.css`. Aplicá los mismos cambios en ambos archivos.
2. Los cambios `a-*` son solo de `admin.css`. Los `c-*` son solo de `client.css`.
3. Hay 2-3 ajustes inline en TSX (gap eyebrow→título); están listados al final.
4. No hace falta tocar lógica, server actions ni queries. Es 100% presentación.

---

## 1) Cambios compartidos — aplicar EN `super.css` Y `admin.css`
Estos selectores existen idénticos en ambos archivos (`.super-shell .X` y `.admin-shell .X`). Cambiá el valor en los dos.

### 1.1 Base
| Selector | Propiedad | Antes | Después |
|---|---|---|---|
| `.s-wrap` | `padding` | `28px var(--pad) 64px` | `36px var(--pad) 64px` |
| shell raíz (`.super-shell` / `.admin-shell`) | `line-height` | `1.5` | `1.55` |

### 1.2 Tipografía
| Selector | Propiedad | Antes | Después |
|---|---|---|---|
| `.s-h1` | `font-size` | `clamp(26px, 3.4vw, 30px)` | `clamp(28px, 3.6vw, 34px)` |
| `.s-h1` | `line-height` | `1.05` | `1.0` |
| `.s-h1` | `letter-spacing` | `-0.02em` | `-0.03em` |
| `.s-h2` | `font-size` | `19px` | `21px` |
| `.s-h2` | `letter-spacing` | `-0.01em` | `-0.02em` |
| `.eyebrow` | `font-weight` | `600` | `700` |
| `.eyebrow` | `letter-spacing` | `0.04em` | `0.10em` |
| `.s-card__title` | `font-size` | `19px` | `19px` (sin cambio) |
| `.s-card__desc` | `font-size` | `13.5px` | `14px` |
| `.s-stat__label` | `letter-spacing` | `0.04em` | `0.09em` |
| `.s-stat__label` | `font-size` | `11.5px` | `11px` |
| `.s-stat__value` | `font-size` | `34px` | `38px` |
| `.s-stat__value` | `letter-spacing` | `-0.02em` | `-0.03em` |
| `.s-stat__sub` | `font-size` | `12.5px` | `13px` |
| `.s-cell-brand .sl` | `font-size` | `12.5px` | `13px` |
| `.s-hint` | `font-size` | `12.5px` | `13px` |
| `.s-defrow__k` | `font-size` | `12.5px` | `13px` |

> **Regla general de "limpiar decimales":** cualquier `font-size` con `.5px` (13.5 / 12.5 / 11.5) que sea texto de cuerpo/meta súbelo al entero próximo de la escala **11 · 12 · 13 · 14 · 15**. Excepción: dejá los badges (`.s-badge` 11.5px) como están — son etiquetas, no texto.

### 1.3 Espaciado (más aire)
| Selector | Propiedad | Antes | Después |
|---|---|---|---|
| `.s-pagehead` | `margin-bottom` | `22px` | `30px` |
| `.s-card` | `padding` | `20px 22px` | `24px 26px` |
| `.s-card--lg` | `padding` | `28px` | `30px` |
| `.s-card__head` | `margin-bottom` | `14px` | `18px` |
| `.s-stats-3`, `.s-stats-4` | `gap` | `14px` | `16px` |
| `.s-stat` | `padding` | `16px 18px` | `20px 22px` |
| `.s-stat` | `gap` | `4px` | `7px` |
| `.s-stats` (brand detail) | `gap` | `14px` | `16px` |
| `.s-stack` | `gap` | `24px` | `28px` |
| `.s-table thead th` | `padding` | `12px 18px` | `15px 22px` |
| `.s-table tbody td` | `padding` | `13px 18px` | `15px 22px` |
| `.s-field + .s-field` | `margin-top` | `14px` | `18px` |
| `.s-form-grid` | `gap` | `16px` | `18px` |
| `.s-form-actions` | `margin-top` | `20px` | `28px` |
| `.s-input` | `height` | `44px` | `46px` |

---

## 2) Cambios solo en `admin.css` (clases `a-*`)
| Selector | Propiedad | Antes | Después |
|---|---|---|---|
| `.a-evgrid` | `gap` | `14px` | `16px` |
| `.a-evcard__media` | `height` | `104px` | `120px` |
| `.a-evcard__name` | `font-size` | `17px` | `18px` |
| `.a-evcard__body` | `padding` | `13px 15px 15px` | `15px 17px 17px` |
| `.a-evcard__meta` | `font-size` | `12.5px` | `13px` |
| `.a-money__cell` | `padding` | `14px 16px` | `18px` |
| `.a-money__v` | `font-size` | `22px` | `26px` |
| `.a-money__v` | `letter-spacing` | — | `-0.02em` (agregar) |
| `.a-typetable th` | `padding` | `12px 14px` | `13px 14px` |
| `.a-typetable td` | `padding` | `12px 14px` | `14px 14px` |
| `.a-yapebanner` | `padding` | `14px 18px` | `15px 18px` |

---

## 3) Cambios solo en `client.css` (clases `c-*`)
| Selector | Propiedad | Antes | Después |
|---|---|---|---|
| shell raíz `.client-shell` | `line-height` | `1.5` | `1.55` |
| `.c-eyebrow` | `letter-spacing` | `0.04em` | `0.10em` |
| `.c-h2` | `font-size` | `20px` | `21px` |
| `.c-h2` | `letter-spacing` | `-0.01em` | `-0.02em` |
| `.c-card` | `padding` | `22px` | `24px` |
| `.c-tt` | `padding` | `18px 20px 18px 24px` | (sin cambio) |
| `.c-tt__name` | `font-size` | `22px` | `22px` (sin cambio) |
| `.c-hcard__title` | `line-height` | `0.94` | `0.92` |
| `.c-rail__label` | `letter-spacing` | `0.14em` | `0.14em` (sin cambio) |
| `.c-co__grid` | `gap` | `clamp(22px,3vw,38px)` | (sin cambio) |
| `.c-stepper` | `margin-bottom` | `clamp(22px,3vw,32px)` | (sin cambio) |
| `.c-input` | `height` | `48px` | `48px` (sin cambio) |

> El checkout del cliente (`client.css`) ya está muy pulido (3 niveles de sombra, stepper, rail sticky). El refresco acá es mínimo: solo subir el tracking de los eyebrows y el `line-height` del cuerpo para que respire igual que los paneles. **No** toques `--brand` ni la inyección de color por marca.

---

## 4) Ajustes inline en TSX (pocos, opcionales)
Hay un gap chico entre el eyebrow y el `<h1>` seteado inline. Para alinearlo al refresco, en los page headers buscá:

```tsx
<h1 className="s-h1" style={{ marginTop: 4 }}>
```
y cambiá `marginTop: 4` → `marginTop: 8`. Archivos: `cabina-7k29x/page.tsx`, `admin/page.tsx` (y cualquier otro `s-pagehead` con el mismo patrón).

Lo mismo para `<p className="s-card__desc">` que sigue al h1: si tiene `marginTop` chico, subilo a `8`.

---

## Design Tokens (referencia, sin cambios de valor salvo los de arriba)

**Color** (no cambian):
`--cream #FBF7F0` · `--cream-2 #F4EDE1` · `--cream-3 #EFE6D6` · `--ink #231C17` · `--ink-2 #6B5F54` · `--ink-3 #A89B8C` · `--tangerine #FF6A3D` · `--tangerine-deep #E8552A` · `--peri #5B6CFF` · `--ok #2E9E6B` · `--warn #C7791A` · `--alert #D7472F`

**Escala tipográfica refrescada** (objetivo final):
- Display XL / `s-h1`: 34px / 800 / `-0.03em` / lh 1.0
- Section / `s-h2`: 21px / 700 / `-0.02em`
- Card title: 19px / 700 / `-0.01em`
- Stat value: 38px / 800 / `-0.03em` / tabular-nums
- Eyebrow: 12px / 700 / `0.10em` / uppercase / `--ink-3`
- Body: 15px / lh 1.55
- Meta: escala limpia **11 · 12 · 13 · 14** (sin `.5`)
- Acento editorial: `Instrument Serif` italic (ya usado en `.c-hcard__lineup`) — usar con moderación para line-ups/citas.

**Espaciado**: base 4px. Valores clave: wrap-top 36 · pagehead-mb 30 · card-pad 24/26 · stat-pad 20/22 · stats-gap 16 · stack-gap 28 · table-cell 15/22.

**Radios** (no cambian): `--r-card 18px` · `--r-ctl 12px` · `--r-pill 999px`.

**Números**: `font-variant-numeric: tabular-nums` en stats, tablas, precios y montos (ya presente en la mayoría; verificar `.a-money__v`, `.s-saldo-num`, precios del cliente).

## Assets
El prototipo usa fotos de stock de Unsplash solo como placeholders de flyers/covers. En producción se usan las imágenes reales subidas por cada marca (`cover_url`, `theme_json.logo_url`). No copiar las URLs de Unsplash.

## Files
- `ParyGo · Refresco de paneles.dc.html` — prototipo de referencia (canvas con 7 frames: notas del sistema, super admin, admin dashboard, admin evento, crear evento, checkout cliente, ticket QR, página de marca).
- Archivos a editar en el codebase:
  - `apps/web/app/cabina-7k29x/super.css`
  - `apps/web/app/admin/admin.css`
  - `apps/web/app/b/[brand]/client.css`
  - (opcional) page headers en `cabina-7k29x/page.tsx`, `admin/page.tsx`

## Checklist de QA visual
- [ ] H1 se ve más grande y tenso en las 3 home.
- [ ] Eyebrows con tracking más amplio (más "premium").
- [ ] No quedan tamaños de fuente con `.5px` en texto de cuerpo/meta.
- [ ] Cards y stats con más padding; las home respiran más.
- [ ] Stat values a 38px y con números tabulares (no "bailan" al actualizar).
- [ ] Tablas (super admin) con filas más altas y cómodas.
- [ ] Cliente: checkout intacto salvo eyebrows + line-height; color de marca sin cambios.
- [ ] Nada de lógica/negocio cambiado; `npm run build` ok.
