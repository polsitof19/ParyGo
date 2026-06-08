# ParyGo · Landing

Ticketing premium para promotores de eventos. Plataforma con marca propia, QR único por entrada, validación en vivo. Desde S/200 por evento, sin comisiones sobre venta.

## Stack

- **Next.js 14** (App Router) con `output: 'export'` — sitio 100% estático.
- **TypeScript** en modo estricto (`strict`, `noUncheckedIndexedAccess`).
- **Tailwind CSS** con design tokens del sistema editorial (cream / negro / terracota).
- **Framer Motion** para reveals al scroll.
- **next/font** (Geist Sans · Instrument Serif · JetBrains Mono) auto-hosteado.
- **Lucide React** para iconografía puntual.
- Despliegue: **Cloudflare Pages**.

## Cómo correr local

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # genera /out (sitio estático)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
```

## Estructura

```
parygo/
├── app/
│   ├── layout.tsx            # Fuentes + metadata + viewport
│   ├── page.tsx              # Composición de secciones
│   ├── globals.css           # Design tokens + utilidades
│   ├── icon.svg              # Favicon
│   ├── sitemap.ts            # Sitemap automático
│   ├── robots.ts             # robots.txt automático
│   └── manifest.ts           # PWA manifest
├── components/
│   ├── Header.tsx
│   ├── sections/             # Hero · Manifiesto · Problemas · Solución
│   │                         # Packs · Proceso · CasosUso · Garantía · FAQ · CtaFooter
│   ├── animations/Reveal.tsx
│   ├── decorative/           # QrMark · TicketStub · CapacityMeter · EventCardMock
│   └── seo/StructuredData.tsx
├── lib/
│   ├── site.ts               # Constantes del sitio (URL, copy, theme color, etc.)
│   ├── cta.ts                # URLs de WhatsApp con mensajes pre-llenados
│   ├── faq.ts                # Fuente única de FAQs (UI + JSON-LD)
│   └── utils.ts              # cn() helper
├── public/
│   ├── _headers              # Security headers + caching para Cloudflare Pages
│   ├── og.svg                # OG image (TODO: rasterizar a PNG 1200×630)
│   └── favicon.svg
├── next.config.mjs           # output:'export', images.unoptimized, optimizePackageImports
├── tailwind.config.ts        # Paleta + tipografías + animaciones
├── tsconfig.json             # strict + noUncheckedIndexedAccess
├── wrangler.toml             # Cloudflare Pages config
└── package.json
```

## Despliegue en Cloudflare Pages

El proyecto está conectado al repo `polsitof19/ParyGo`. Cloudflare Pages debe estar configurado así:

| Campo | Valor |
|---|---|
| Framework preset | Next.js (Static HTML Export) — o ninguno |
| Build command | `npm run build` |
| Build output directory | `out` |
| Root directory | (vacío / raíz del repo) |
| Node version | 20 |

Con `wrangler.toml` en raíz, Cloudflare detecta automáticamente `pages_build_output_dir = "out"`.

## Variables de entorno

No requiere variables de entorno. Todas las constantes están en `lib/site.ts`.

## CTAs

Todos los CTAs apuntan a WhatsApp `+56 9 3288 1230` con mensaje pre-llenado. Las URLs están centralizadas en `lib/cta.ts` y se generan desde la constante `whatsappNumber` en `lib/site.ts`.

## SEO

- Title, description, keywords, OpenGraph, Twitter Card en `app/layout.tsx`
- JSON-LD (`Organization`, `Service` con `OfferCatalog`, `FAQPage`, `WebSite`) inyectado en `<head>` desde `components/seo/StructuredData.tsx`
- `sitemap.xml`, `robots.txt`, `manifest.webmanifest` generados automáticamente por Next.js
- Theme color y meta tags en `app/layout.tsx`

## Verificar Google Search Console

Dos formas (ambas funcionan con `output: export` en Cloudflare Pages). Elegí UNA:

**Opción A — Meta tag (recomendada, "pegar y deployar"):**
1. En Search Console → *Agregar propiedad* (prefijo de URL `https://parygo.com`) →
   método *Etiqueta HTML*. Google te da algo como
   `<meta name="google-site-verification" content="AbC123..." />`.
2. Copiá SOLO el valor de `content` y pegalo en `lib/site.ts`:
   `googleSiteVerification: 'AbC123...'`.
3. Re-deploy a prod (ver más abajo). Next emite el `<meta>` en el `<head>` de
   todas las páginas. Verificá en Search Console.

**Opción B — Archivo HTML:**
1. Search Console te da un archivo `googleXXXXXXXX.html`.
2. Ponelo en `public/googleXXXXXXXX.html` (todo lo de `public/` se sirve en la
   raíz → quedará en `https://parygo.com/googleXXXXXXXX.html`).
3. Re-deploy. Verificá en Search Console.

**Deploy a prod del landing:**
```bash
npm run build
npx wrangler pages deploy out --project-name parygo --branch main --commit-dirty=true
```

Sitemap y robots ya responden con el dominio canónico:
`https://parygo.com/sitemap.xml` y `https://parygo.com/robots.txt`.

## Performance

- `output: 'export'` → HTML estático servido directo desde CDN
- `optimizePackageImports` para `lucide-react` y `framer-motion`
- `next/font` con `display: swap` para evitar FOIT
- Imágenes sin optimización (estáticas, ya optimizadas como SVG inline)
- `prefers-reduced-motion` respetado en `globals.css`

## Contacto

WhatsApp: [+56 9 3288 1230](https://wa.me/56932881230)

## Licencia

Propietario — ParyGo, 2026. Todos los derechos reservados.
