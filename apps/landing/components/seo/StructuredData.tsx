import { SITE } from '@/lib/site';
import { PACKS } from '@/lib/packs';
import { FAQ } from '@/lib/faq';

const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE.name,
  url: SITE.url,
  logo: `${SITE.url}/og.png`,
  description: SITE.description,
  contactPoint: [
    {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: SITE.email,
      availableLanguage: ['Spanish'],
      areaServed: ['Latin America', 'Worldwide'],
    },
  ],
};

const service = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  serviceType: 'Ticketing platform',
  provider: { '@type': 'Organization', name: SITE.name, url: SITE.url },
  areaServed: ['Latin America', 'Worldwide'],
  name: 'Plataforma de ticketing para promotores de eventos',
  description: SITE.description,
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Packs ParyGo',
    itemListElement: PACKS.map((p) => ({
      '@type': 'Offer',
      name: `${p.eventos} evento${p.eventos === 1 ? '' : 's'}`,
      price: String(p.usd),
      priceCurrency: 'USD',
      url: `${SITE.url}#precios`,
      itemOffered: { '@type': 'Service', name: `ParyGo · ${p.eventos} evento${p.eventos === 1 ? '' : 's'}` },
    })),
  },
};

const faq = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  url: SITE.url,
  name: SITE.name,
  inLanguage: 'es',
};

// Escapa < > & a su forma unicode para que el JSON-LD no pueda romper el <script>
// ni inyectar markup. Hoy el contenido es 100% estático, pero lo dejamos blindado
// (mismo criterio que EventStructuredData del web app).
function jsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export function StructuredData() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organization) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(service) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(website) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faq) }} />
    </>
  );
}
