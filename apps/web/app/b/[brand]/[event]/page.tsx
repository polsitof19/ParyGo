import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv, publicEnv } from '@/lib/env';
import { formatPEN } from '@/lib/utils';
import { EventCheckoutPanel } from './EventCheckoutPanel';
import { EventStructuredData } from './EventStructuredData';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Hash estable (no reversible) para deduplicar clics por visitante sin guardar IP.
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

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
    .select('id, name, description, price_cents, capacity, sold, sort_order, color_hex, is_active, is_unlimited, bulk_min_qty, bulk_discount_pct')
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

  // Tracking de clics del link de promotor (?ref). Best-effort: registra un clic
  // por visitante/día atribuido al código (solo si existe). Hasheamos la IP (no
  // se guarda cruda) y nunca rompemos la página si falla. service_role vía RPC.
  if (refCode) {
    try {
      const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      // Salt con un secreto del server → el hash no es enumerable por fuerza bruta
      // del espacio de IPs (defensa de privacidad). No se guarda la IP cruda.
      const visitorHash = await sha256Hex(`${ip}:${event.id}:${serverEnv.BRAND_CREDS_ENCRYPTION_KEY}`);
      await createAdminClient().rpc('record_ref_click', { p_event_id: event.id, p_ref_code: refCode, p_visitor_hash: visitorHash });
    } catch (e) {
      console.error('record_ref_click failed', { eventId: event.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // El panel del COMPRADOR no recibe capacity/sold (no se filtran al cliente);
  // solo el booleano soldOut. EventStructuredData (server-side) sí los usa.
  const panelTypes = ticketTypes.map(({ capacity: _cap, sold: _sold, ...rest }) => rest);

  const shareUrl = `https://${brand.slug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/${event.slug}`;

  return (
    <>
      <EventStructuredData brand={brand} event={event} ticketTypes={ticketTypes} />

      <article style={{ paddingBottom: 64 }}>
        {/* CHECKOUT (hero, entradas, datos/pago, resumen y "dónde" viven en el panel) */}
        <EventCheckoutPanel
          brand={brand}
          event={event}
          ticketTypes={panelTypes}
          mpConfigured={mpConfigured}
          mpPublicKey={mpPublicKey}
          refCode={refCode}
          shareUrl={shareUrl}
        />

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
