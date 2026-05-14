import { SITE } from '@/lib/site';
import { FAQ_ITEMS } from '@/lib/faq';

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
      telephone: '+56932881230',
      availableLanguage: ['Spanish'],
      areaServed: ['PE', 'LATAM'],
    },
  ],
  sameAs: [`https://wa.me/${SITE.whatsappNumber}`],
};

const service = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  serviceType: 'Ticketing platform',
  provider: { '@type': 'Organization', name: SITE.name, url: SITE.url },
  areaServed: ['Peru', 'Latin America'],
  name: 'Plataforma de ticketing para promotores de eventos',
  description: SITE.description,
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Packs ParyGo',
    itemListElement: [
      {
        '@type': 'Offer',
        name: 'Pack 1 — 1 evento',
        price: '200',
        priceCurrency: 'PEN',
        url: `${SITE.url}#packs`,
        itemOffered: { '@type': 'Service', name: 'Pack 1 evento' },
      },
      {
        '@type': 'Offer',
        name: 'Pack 3 — 3 eventos',
        price: '540',
        priceCurrency: 'PEN',
        url: `${SITE.url}#packs`,
        itemOffered: { '@type': 'Service', name: 'Pack 3 eventos' },
      },
      {
        '@type': 'Offer',
        name: 'Pack 5 — 5 eventos',
        price: '850',
        priceCurrency: 'PEN',
        url: `${SITE.url}#packs`,
        itemOffered: { '@type': 'Service', name: 'Pack 5 eventos' },
      },
      {
        '@type': 'Offer',
        name: 'Pack 10 — 10 eventos',
        price: '1500',
        priceCurrency: 'PEN',
        url: `${SITE.url}#packs`,
        itemOffered: { '@type': 'Service', name: 'Pack 10 eventos' },
      },
    ],
  },
};

const faq = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a,
    },
  })),
};

const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  url: SITE.url,
  name: SITE.name,
  inLanguage: 'es-PE',
};

export function StructuredData() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(service) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
    </>
  );
}
