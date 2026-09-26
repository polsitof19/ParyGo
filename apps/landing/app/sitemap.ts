import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

// Las dos versiones de la landing, cada una con su alternativa (hreflang).
export default function sitemap(): MetadataRoute.Sitemap {
  const idiomas = { es: SITE.url + '/', en: SITE.url + '/en/' };
  return [
    { url: idiomas.es, lastModified: new Date(), changeFrequency: 'weekly', priority: 1, alternates: { languages: idiomas } },
    { url: idiomas.en, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9, alternates: { languages: idiomas } },
  ];
}
