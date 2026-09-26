export const SITE = {
  name: 'ParyGo',
  domain: 'parygo.com',
  url: 'https://parygo.com',
  // Título, descripción, keywords y locale viven en lib/i18n.ts (uno por idioma).
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
