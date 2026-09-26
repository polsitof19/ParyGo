# ParyGo

Plataforma de ticketing premium para promotores de eventos urbanos en Perú y LATAM.

Monorepo con dos aplicaciones independientes:

## Estructura

```
ParyGo/
├── apps/
│   ├── landing/      # Marketing site (Cloudflare Pages, static export)
│   └── web/          # SaaS app multi-tenant (Vercel, Server Actions + Supabase)
├── supabase/         # Migrations SQL + seed scripts (single source of truth)
└── package.json      # npm workspaces root
```

## Apps

### `apps/landing`
- **Stack**: Next.js 14 App Router · `output: 'export'` · Tailwind · Anton + Inter
- **Deploy**: Cloudflare Pages
- **URL prod**: https://parygo.pages.dev
- **Build**: `npm run build:landing` → output en `apps/landing/out`

### `apps/web`
- **Stack**: Next.js 14 App Router (server mode) · TypeScript estricto · Tailwind + shadcn/ui · Supabase
- **Deploy**: Vercel
- **URL prod**:
  - `app.parygo.com` → super admin + onboarding
  - `*.parygo.com` → subdominios dinámicos por marca (ej. `code.parygo.com`)
- **Build**: `npm run build:web` → output `.next` server

## Quickstart local

```bash
# install
npm install   # instala dependencias de los dos workspaces

# correr landing
npm run dev:landing
# http://localhost:3000

# correr web
npm run dev:web
# http://localhost:3001 (configurar puerto en script)
```

## Stack técnico

- **Frontend**: Next.js 14 + TypeScript + Tailwind + shadcn/ui
- **Backend**: Supabase (Postgres + Auth + Storage + RLS multi-tenant)
- **Pagos**: MercadoPago Checkout Pro (credenciales del promotor, no nuestras)
- **Email**: Resend
- **QR**: `qrcode` server-side + `@react-pdf/renderer` para PDF
- **Validador puerta**: PWA + `@yudiel/react-qr-scanner` + IndexedDB offline

## Roles

- **Super admin** (Paul): crea marcas + eventos, gestiona credenciales MP
- **Brand admin** (promotor): edita su evento, ve métricas, aprueba Yape manual, gestiona validadores
- **Validator** (staff puerta): solo escanea QR
- **Comprador**: sin login, checkout invitado

## Modelo de negocio

- ParyGo cobra **S/200 fijo por evento** al promotor (pagado fuera de plataforma vía Yape/transferencia)
- El dinero de las ventas de entradas **nunca pasa por ParyGo** — cada promotor configura sus propias credenciales MP + su número Yape
- Liquidación va directo a la cuenta del promotor (24-72h en el caso de MP)

## Contacto

WhatsApp: +56 9 3288 1230

## Licencia

Propietario · ParyGo · 2026
