export const SITE = {
  name: 'ParyGo',
  domain: 'parygo.com',
  url: 'https://parygo.com',
  title: 'ParyGo — Vende las entradas de tu evento con tu marca, sin comisión',
  description:
    'Vende entradas para fiestas, conciertos y eventos con tu propia marca. Tu público paga directo a tu cuenta, sin comisión por entrada, y controlas quién entra con QR. Prueba gratis.',
  keywords: [
    'vender entradas online',
    'entradas eventos discoteca',
    'plataforma de ticketing sin comisión',
    'ticketing latam',
    'venta entradas online',
    'qr eventos',
  ],
  locale: 'es_LA',
  // Acceso de ORGANIZADORES al panel (login que ya existe en el app de venta).
  // Los compradores NO se loguean.
  loginUrl: 'https://app.parygo.com/login',
  // Google Search Console — verificación por meta tag.
  // Cuando Paul tenga el código de Google (Search Console → Agregar propiedad →
  // "Etiqueta HTML"), pegar SOLO el valor del content="..." acá y re-deployar.
  // Vacío = no se emite ninguna etiqueta. Ej: 'abc123def456...'
  googleSiteVerification: '',
  // Contacto: SOLO correo (2026-09-23, fuera el WhatsApp de soporte).
  email: 'parygoasistencia@gmail.com',
  themeColor: '#FBF7F0',
  // PNG rasterizado 1200x630 (los crawlers sociales —WhatsApp, FB, X— no aceptan SVG).
  ogImage: '/og.png',
} as const;
