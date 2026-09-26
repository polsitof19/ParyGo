import { SITE } from '@/lib/site';
import { PACKS } from '@/lib/packs';
import type { Dict } from '@/lib/i18n';

// Escapa < > & a su forma unicode para que el JSON-LD no pueda romper el <script>
// ni inyectar markup. Hoy el contenido es 100% estático, pero lo dejamos blindado
// (mismo criterio que EventStructuredData del web app).
function jsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export function StructuredData({ t }: { t: Dict }) {
  const url = t.lang === 'en' ? `${SITE.url}/en/` : SITE.url;
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/og.png`,
    description: t.meta.description,
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'sales', email: SITE.email, availableLanguage: ['Spanish', 'English'], areaServed: ['Latin America', 'Worldwide'] }],
  };
  const service = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'Ticketing platform',
    provider: { '@type': 'Organization', name: SITE.name, url: SITE.url },
    areaServed: ['Latin America', 'Worldwide'],
    name: t.meta.title,
    description: t.meta.description,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'ParyGo',
      itemListElement: PACKS.map((p) => ({
        '@type': 'Offer',
        name: `${p.eventos} ${p.eventos === 1 ? t.precios.evento : t.precios.eventos}`,
        price: String(p.usd),
        priceCurrency: 'USD',
        url: `${url}#precios`,
      })),
    },
  };
  const website = { '@context': 'https://schema.org', '@type': 'WebSite', url, name: SITE.name, inLanguage: t.htmlLang };
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: t.htmlLang,
    mainEntity: t.faq.items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  return (
    <>
      {[organization, service, website, faq].map((o, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(o) }} />
      ))}
    </>
  );
}
