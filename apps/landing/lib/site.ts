export const SITE = {
  name: 'ParyGo',
  domain: 'parygo.com',
  url: 'https://parygo.com',
  title: 'ParyGo — Vende las entradas de tu evento sin complicarte',
  description:
    'Discotecas, conciertos, fiestas, cumpleaños. Vende entradas con tu marca, cobra directo por Yape y tarjeta (cero comisión por entrada) y controla quién entra con QR. Desde S/200 por evento.',
  keywords: [
    'ticketing peru',
    'entradas eventos discoteca',
    'plataforma boletos lima',
    'ticketing latam',
    'venta entradas online',
    'qr eventos',
  ],
  locale: 'es_PE',
  // Acceso de ORGANIZADORES al panel (login que ya existe en el app de venta).
  // Los compradores NO se loguean.
  loginUrl: 'https://app.parygo.com/login',
  // Google Search Console — verificación por meta tag.
  // Cuando Paul tenga el código de Google (Search Console → Agregar propiedad →
  // "Etiqueta HTML"), pegar SOLO el valor del content="..." acá y re-deployar.
  // Vacío = no se emite ninguna etiqueta. Ej: 'abc123def456...'
  googleSiteVerification: '',
  whatsappNumber: '56932881230',
  whatsappDisplay: '+56 9 3288 1230',
  themeColor: '#FBF7F0',
  // TODO: replace with rasterized PNG (1200x630) for Facebook/Twitter card support.
  // Most social crawlers do not accept SVG for OG images.
  ogImage: '/og.svg',
} as const;
