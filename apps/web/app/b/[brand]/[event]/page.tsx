import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Calendar, MapPin, ShieldCheck, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { formatPEN } from '@/lib/utils';
import { optimizedImage } from '@/lib/imageUrl';
import { EventCheckoutPanel } from './EventCheckoutPanel';
import { EventStructuredData } from './EventStructuredData';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type Props = {
  params: { brand: string; event: string };
};

async function loadEvent(brandSlug: string, eventSlug: string) {
  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, slug, name, theme_json, whatsapp_e164, yape_number, yape_holder, contact_email')
    .eq('slug', brandSlug)
    .maybeSingle();
  if (!brand) return null;

  const { data: event } = await supabase
    .from('events')
    .select(`
      id, slug, name, description, starts_at, ends_at,
      venue_name, venue_address, venue_lat, venue_lng,
      cover_url, min_age, refund_policy, is_published
    `)
    .eq('brand_id', brand.id)
    .eq('slug', eventSlug)
    .eq('is_published', true)
    .maybeSingle();
  if (!event) return null;

  const { data: ticketTypes } = await supabase
    .from('ticket_types')
    .select('id, name, description, price_cents, capacity, sold, sort_order, color_hex, is_active, is_unlimited')
    .eq('event_id', event.id)
    .eq('is_active', true)
    .order('sort_order')
    // Display order: HIGHEST price first (anchoring). After fetching by
    // sort_order, we resort client-side to allow promoters to override.
    ;

  // Resolve the ACTIVE price phase per ticket type (single source of truth in
  // SQL). Falls back to ticket_types.price_cents for types without phases.
  const { data: activePrices } = await supabase.rpc('get_event_active_prices', {
    p_event_id: event.id,
  });
  const priceByType = new Map(
    (activePrices ?? []).map((r) => [r.ticket_type_id, r])
  );
  const ticketTypesWithPhase = (ticketTypes ?? []).map((t) => {
    const ap = priceByType.get(t.id);
    return {
      ...t,
      active_price_cents: ap?.active_price_cents ?? t.price_cents,
      next_price_cents: ap?.next_price_cents ?? null,
      next_starts_at: ap?.next_starts_at ?? null,
    };
  });

  // MercadoPago: the card option only shows if THIS brand configured MP creds.
  // The public_key (inherently public) is read server-side and handed to the
  // browser for the Wallet Brick; the access_token never leaves the server.
  // Brands without MP (e.g. Almighty/Yape-only) get yape-only checkout, unchanged.
  const admin = createAdminClient();
  const { data: mpStatus } = await admin.rpc('get_brand_mp_status', { p_brand_id: brand.id });
  const status = Array.isArray(mpStatus) ? mpStatus[0] : null;
  const mpConfigured = Boolean(status?.has_access_token && status?.has_public_key);
  let mpPublicKey: string | null = null;
  if (mpConfigured) {
    const { data: pk, error: pkErr } = await admin.rpc('get_brand_mp_public_key', {
      p_brand_id: brand.id,
      p_encryption_key: serverEnv.BRAND_CREDS_ENCRYPTION_KEY,
    });
    // Degrade gracefully (MP option hidden) but log so a transient failure that
    // silently drops the card option for a configured brand is traceable.
    if (pkErr) console.error('get_brand_mp_public_key failed', { brandId: brand.id, error: pkErr.message });
    mpPublicKey = typeof pk === 'string' && pk.length > 0 ? pk : null;
  }

  return {
    brand,
    event,
    ticketTypes: ticketTypesWithPhase,
    // MP is only really usable if BOTH the creds and the decrypted public_key are present.
    mpConfigured: mpConfigured && Boolean(mpPublicKey),
    mpPublicKey,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadEvent(params.brand, params.event);
  if (!data) return { title: 'Evento no encontrado' };
  const { brand, event } = data;
  const title = `${event.name} · ${brand.name}`;
  const description = event.description ?? `Entradas para ${event.name}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: event.cover_url ? [event.cover_url] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: event.cover_url ? [event.cover_url] : undefined,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function EventPage({ params }: Props) {
  const data = await loadEvent(params.brand, params.event);
  if (!data) notFound();
  const { brand, event, ticketTypes, mpConfigured, mpPublicKey } = data;

  const startsAt = new Date(event.starts_at);
  // Capacity meter is meaningful only for LIMITED types; unlimited types are
  // excluded so the bar doesn't show a fake "X / 0".
  const limitedTypes = ticketTypes.filter((t) => !t.is_unlimited);
  const totalCapacity = limitedTypes.reduce((acc, t) => acc + t.capacity, 0);
  const totalSold = limitedTypes.reduce((acc, t) => acc + t.sold, 0);

  const dateLabel = new Intl.DateTimeFormat('es-PE', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
  }).format(startsAt);
  const hasCover = Boolean(event.cover_url);

  return (
    <>
      <EventStructuredData brand={brand} event={event} ticketTypes={ticketTypes} />

      <article style={{ paddingBottom: 64 }}>
        {/* HERO / PORTADA */}
        <section className={`c-hero ${hasCover ? 'c-hero--img' : 'c-hero--tint'}`}>
          <div className="c-hero__bg">
            {hasCover && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={optimizedImage(event.cover_url, { width: 1080, quality: 72 })} alt="" className="c-hero__img" fetchPriority="high" decoding="async" />
                <div className="c-hero__veil" style={{ background: 'linear-gradient(180deg, rgba(20,14,10,.25), rgba(20,14,10,.72))' }} />
              </>
            )}
          </div>
          <div className="c-hero__inner">
            <span className="c-live"><span className="dot" /> Vendiendo ahora</span>
            <h1>{event.name}</h1>
            {event.description && <p className="c-hero__desc">{event.description}</p>}
            <div className="c-chips">
              <span className="c-chip"><Calendar className="h-4 w-4" /> {dateLabel}</span>
              {event.venue_name && <span className="c-chip"><MapPin className="h-4 w-4" /> {event.venue_name}</span>}
              {event.min_age > 0 && <span className="c-chip"><ShieldCheck className="h-4 w-4" /> +{event.min_age}</span>}
            </div>
          </div>
        </section>

        {/* MEDIDOR DE CAPACIDAD */}
        {totalCapacity > 0 && (
          <div className="c-meter">
            <div className="c-meter__inner">
              <span className="c-muted">Capacidad · {totalSold}/{totalCapacity}</span>
              <div className="c-meter__bar" role="progressbar" aria-valuenow={totalSold} aria-valuemin={0} aria-valuemax={totalCapacity} aria-label={`Capacidad: ${totalSold} de ${totalCapacity}`}>
                <div className="c-meter__fill" style={{ width: `${Math.min(100, (totalSold / totalCapacity) * 100)}%` }} />
              </div>
              <span className="c-eyebrow">En vivo</span>
            </div>
          </div>
        )}

        {/* PANEL DE CHECKOUT */}
        <EventCheckoutPanel
          brand={brand}
          event={event}
          ticketTypes={ticketTypes}
          mpConfigured={mpConfigured}
          mpPublicKey={mpPublicKey}
        />

        {/* DÓNDE + DEVOLUCIONES */}
        {(event.venue_address || event.refund_policy) && (
          <section className="c-wrap" style={{ marginTop: 40, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {event.venue_address && (
              <div className="c-card">
                <p className="c-card__title">Dónde</p>
                <p className="c-h2">{event.venue_name}</p>
                <p className="c-muted" style={{ marginTop: 4 }}>{event.venue_address}</p>
                {event.venue_lat && event.venue_lng && (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${event.venue_lat},${event.venue_lng}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12, color: 'var(--brand-ink)', fontWeight: 600, fontSize: 14 }}>
                    Ver en Google Maps <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}
            {event.refund_policy && (
              <div className="c-card">
                <p className="c-card__title">Devoluciones</p>
                <p className="c-muted">{event.refund_policy}</p>
              </div>
            )}
          </section>
        )}

        {/* SOPORTE */}
        {brand.whatsapp_e164 && (
          <p className="c-foot">
            ¿Problema con tu compra?{' '}
            <a href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>
              WhatsApp soporte
            </a>
          </p>
        )}

        <p className="sr-only">
          Entradas desde {formatPEN(Math.min(...(ticketTypes.length ? ticketTypes.map((t) => t.active_price_cents) : [0])))}.
        </p>
      </article>
    </>
  );
}
