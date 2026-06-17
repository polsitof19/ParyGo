import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Calendar, MapPin, ShieldCheck, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv, publicEnv } from '@/lib/env';
import { formatPEN } from '@/lib/utils';
import { optimizedImage } from '@/lib/imageUrl';
import { EventCheckoutPanel } from './EventCheckoutPanel';
import { EventStructuredData } from './EventStructuredData';
import { ShareEvent } from './ShareEvent';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type Props = {
  params: { brand: string; event: string };
  searchParams?: { ref?: string | string[] };
};

async function loadEvent(brandSlug: string, eventSlug: string) {
  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, slug, name, theme_json, whatsapp_e164, yape_number, yape_holder, contact_email')
    .eq('slug', brandSlug)
    .is('archived_at', null) // marca archivada → evento no carga
    .maybeSingle();
  if (!brand) return null;

  const { data: event } = await supabase
    .from('events')
    .select(`
      id, slug, name, description, starts_at, ends_at,
      venue_name, venue_address, venue_lat, venue_lng, venue_maps_url,
      cover_url, min_age, require_age_confirmation, require_dni, collect_attendee_names, refund_policy, is_published
    `)
    .eq('brand_id', brand.id)
    .eq('slug', eventSlug)
    .eq('is_published', true)
    .is('archived_at', null) // evento archivado → 404 (oculto del público)
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
      active_name: ap?.active_name ?? null,
      active_ends_at: ap?.active_ends_at ?? null,
      next_price_cents: ap?.next_price_cents ?? null,
      next_starts_at: ap?.next_starts_at ?? null,
      next_name: ap?.next_name ?? null,
      // Estado de agotado calculado SERVER-side; capacity/sold no salen al cliente.
      soldOut: !t.is_unlimited && (t.capacity - t.sold) <= 0,
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

export default async function EventPage({ params, searchParams }: Props) {
  const data = await loadEvent(params.brand, params.event);
  if (!data) notFound();
  const { brand, event, ticketTypes, mpConfigured, mpPublicKey } = data;

  // B5 — link propio por promotor: ?ref=CÓDIGO pre-rellena el campo de RR.PP.
  // Solo prefill (la lógica de promo no cambia); si es inválido, el campo es
  // editable y el checkout no se rompe. Sanitizamos a [A-Za-z0-9_-] máx 32.
  const refRaw = Array.isArray(searchParams?.ref) ? searchParams?.ref[0] : searchParams?.ref;
  const refCode = (refRaw ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);

  const startsAt = new Date(event.starts_at);

  // El panel del COMPRADOR no recibe capacity/sold (no se filtran al cliente);
  // solo el booleano soldOut. EventStructuredData (server-side) sí los usa.
  const panelTypes = ticketTypes.map(({ capacity: _cap, sold: _sold, ...rest }) => rest);

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
                {/* Velo tintado con el color de la marca abajo → cada flyer se siente propio de la marca */}
                <div className="c-hero__veil" style={{ background: 'linear-gradient(180deg, rgba(20,14,10,.12) 0%, rgba(20,14,10,.50) 62%, color-mix(in srgb, var(--brand) 55%, rgba(20,14,10,.82)) 100%)' }} />
              </>
            )}
          </div>
          <div className={`c-hero__inner ${hasCover ? 'c-hero__inner--poster' : ''}`}>
            <div className="c-hero__copy">
              <span className="c-live"><span className="dot" /> Vendiendo ahora</span>
              <h1>{event.name}</h1>
              {event.description && <p className="c-hero__desc">{event.description}</p>}
              <div className="c-chips">
                <span className="c-chip"><Calendar className="h-4 w-4" /> {dateLabel}</span>
                {event.venue_name && <span className="c-chip"><MapPin className="h-4 w-4" /> {event.venue_name}</span>}
                {event.min_age > 0 && <span className="c-chip"><ShieldCheck className="h-4 w-4" /> +{event.min_age}</span>}
              </div>
              <ShareEvent
                eventName={event.name}
                shareUrl={`https://${brand.slug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/${event.slug}`}
              />
            </div>
            {hasCover && (
              // Flyer nítido como póster (no solo fondo borroso): el arte real del
              // evento, enmarcado y de alta calidad. El fondo queda como ambiente.
              <div className="c-hero__poster">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={optimizedImage(event.cover_url, { width: 760, quality: 82 })} alt={`Flyer de ${event.name}`} decoding="async" />
              </div>
            )}
          </div>
        </section>

        {/* PANEL DE CHECKOUT */}
        <EventCheckoutPanel
          brand={brand}
          event={event}
          ticketTypes={panelTypes}
          mpConfigured={mpConfigured}
          mpPublicKey={mpPublicKey}
          refCode={refCode}
        />

        {/* DÓNDE + DEVOLUCIONES */}
        {(event.venue_address || event.refund_policy) && (
          <section className="c-wrap" style={{ marginTop: 40, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {event.venue_address && (
              <div className="c-card">
                <p className="c-card__title">Dónde</p>
                <p className="c-h2">{event.venue_name}</p>
                <p className="c-muted" style={{ marginTop: 4 }}>{event.venue_address}</p>
                {/* Mapa embed OFICIAL de Google (sin API key, lazy) — responsive */}
                <div style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--cream-3)', aspectRatio: '16 / 10', background: 'var(--cream-2)' }}>
                  <iframe
                    title={`Mapa de ${event.venue_name ?? 'la ubicación'}`}
                    src={`https://www.google.com/maps?q=${encodeURIComponent(event.venue_address)}&z=16&output=embed`}
                    style={{ border: 0, display: 'block', width: '100%', height: '100%' }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                <a
                  href={
                    event.venue_maps_url?.startsWith('https://')
                      ? event.venue_maps_url
                      : event.venue_lat && event.venue_lng
                        ? `https://www.google.com/maps/search/?api=1&query=${event.venue_lat},${event.venue_lng}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue_address)}`
                  }
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12, color: 'var(--brand-ink)', fontWeight: 600, fontSize: 14 }}
                >
                  Cómo llegar <ExternalLink className="h-3.5 w-3.5" />
                </a>
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
        <p className="c-foot">
          ¿Ya compraste y perdiste tu entrada?{' '}
          <a href="/reenviar" style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>Reenviála a tu email</a>
          {brand.whatsapp_e164 && (
            <>
              {' · '}
              <a href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>
                WhatsApp soporte
              </a>
            </>
          )}
        </p>
        <p className="c-foot" style={{ marginTop: 6, fontSize: 12 }}>
          <a href="/terminos" style={{ color: 'var(--ink-3)' }}>Términos</a>
          {' · '}
          <a href="/privacidad" style={{ color: 'var(--ink-3)' }}>Privacidad</a>
        </p>

        <p className="sr-only">
          Entradas desde {formatPEN(Math.min(...(ticketTypes.length ? ticketTypes.map((t) => t.active_price_cents) : [0])))}.
        </p>
      </article>
    </>
  );
}
