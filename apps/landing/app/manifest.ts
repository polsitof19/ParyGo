import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';
import { DICT } from '@/lib/i18n';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.name,
    description: DICT.es.meta.description,
    start_url: '/',
    display: 'standalone',
    background_color: SITE.themeColor,
    theme_color: SITE.themeColor,
    icons: [
      { src: '/icon.png?v=2', sizes: '512x512', type: 'image/png' },
      { src: '/favicon.svg?v=2', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
