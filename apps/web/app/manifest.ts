import type { MetadataRoute } from 'next';

// Installable PWA for door staff: the scanner runs full-screen on the phone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ParyGo · Puerta',
    short_name: 'ParyGo Puerta',
    description: 'Validador de entradas en la puerta del evento.',
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
