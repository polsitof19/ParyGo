// Server component. Renders schema.org Event JSON-LD for the public event
// page. Helps Google show rich results (dates, location, price from).

import { publicEnv } from '@/lib/env';

type Props = {
  brand: { slug: string; name: string };
  event: {
    name: string;
    description: string | null;
    starts_at: string;
    ends_at: string | null;
    venue_name: string | null;
    venue_address: string | null;
    venue_lat: number | null;
    venue_lng: number | null;
    cover_url: string | null;
    slug: string;
  };
  ticketTypes: {
    name: string;
    active_price_cents: number;
    capacity: number;
    sold: number;
    is_unlimited: boolean;
  }[];
};

export function EventStructuredData({ brand, event, ticketTypes }: Props) {
  const url = `https://${brand.slug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/${event.slug}`;

  const offers = ticketTypes.map((t) => {
    const remaining = t.capacity - t.sold;
    const availability = t.is_unlimited
      ? 'https://schema.org/InStock'
      : remaining <= 0
        ? 'https://schema.org/SoldOut'
        : remaining < t.capacity * 0.2
          ? 'https://schema.org/LimitedAvailability'
          : 'https://schema.org/InStock';
    return {
      '@type': 'Offer',
      name: t.name,
      price: (t.active_price_cents / 100).toFixed(2),
      priceCurrency: 'PEN',
      availability,
      url,
      // Don't emit a fresh validFrom on every render — Google's crawl will
      // see it changing constantly. Tie validity to the event window.
      validFrom: event.starts_at,
      priceValidUntil: event.ends_at ?? event.starts_at,
    };
  });

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.name,
    startDate: event.starts_at,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    organizer: {
      '@type': 'Organization',
      name: brand.name,
      url: `https://${brand.slug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}`,
    },
    url,
    offers,
  };
  if (event.ends_at) data.endDate = event.ends_at;
  if (event.description) data.description = event.description;
  if (event.cover_url) data.image = event.cover_url;
  if (event.venue_name) {
    const place: Record<string, unknown> = {
      '@type': 'Place',
      name: event.venue_name,
    };
    if (event.venue_address) {
      place.address = {
        '@type': 'PostalAddress',
        streetAddress: event.venue_address,
        addressCountry: 'PE',
      };
    }
    if (event.venue_lat != null && event.venue_lng != null) {
      place.geo = {
        '@type': 'GeoCoordinates',
        latitude: event.venue_lat,
        longitude: event.venue_lng,
      };
    }
    data.location = place;
  }

  return (
    <script
      type="application/ld+json"
      // Escape canónico (Next/React) de < > & en el JSON-LD: evita que un
      // nombre/descripción de evento con "</script>" o "<!--" rompa el tag e
      // inyecte HTML (XSS almacenado vía dato del promotor).
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data)
          .replace(/</g, '\\u003c')
          .replace(/>/g, '\\u003e')
          .replace(/&/g, '\\u0026'),
      }}
    />
  );
}
