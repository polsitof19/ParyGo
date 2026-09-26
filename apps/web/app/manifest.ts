import type { MetadataRoute } from 'next';

// PWA instalable (pantalla de inicio). Abre /scan: el staff de puerta cae en
// el escáner, el organizador en el de su marca y el super admin (sin marcas)
// lo redirige a su cabina. Nombre genérico porque la usan los tres.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ParyGo',
    short_name: 'ParyGo',
    description: 'Panel, escáner y cabina de ParyGo.',
    start_url: '/scan',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0d0d10',
    theme_color: '#0d0d10',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
