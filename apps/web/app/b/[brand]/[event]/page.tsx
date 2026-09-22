import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv, publicEnv } from '@/lib/env';
import { formatPEN } from '@/lib/utils';
import { isPubliclyOffered } from '@/lib/publicTicketGuard';
import { leerConcepto } from '@/lib/concepto';
import { optimizedImage } from '@/lib/imageUrl';
import { EventCheckoutPanel } from './EventCheckoutPanel';
import { EventStructuredData } from './EventStructuredData';
import { FondoFlyer } from './conceptos';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Hash estable (no reversible) para deduplicar clics por visitante sin guardar IP.
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

type Props = {
  params: { brand: string; event: string };
  searchParams?: { ref?: string | string[]; v?: string | string[]; c?: string | string[]; flyer?: string | string[] };
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
      cover_url, min_age, require_age_confirmation, require_dni, collect_attendee_names, refund_policy, is_published, is_free
    `)
    .eq('brand_id', brand.id)
    .eq('slug', eventSlug)
    .eq('is_published', true)
    .is('archived_at', null) // evento archivado → 404 (oculto del público)
    .maybeSingle();
  if (!event) return null;

  const { data: ticketTypes } = await supabase
    .from('ticket_types')
    .select('id, name, description, price_cents, capacity, sold, sort_order, color_hex, is_active, is_unlimited, bulk_min_qty, bulk_discount_pct, is_courtesy')
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
  // Escalera de fases por tipo (todas, no solo la vigente): el comprador ve
  // hasta cuándo dura el precio de hoy y cuánto viene después.
  const { data: phaseRows } = await supabase
    .from('ticket_type_price_phases')
    .select('ticket_type_id, name, price_cents, starts_at, ends_at, sort_order')
    .in('ticket_type_id', (ticketTypes ?? []).map((t) => t.id))
    .order('sort_order');
  const phasesByType = new Map<string, { name: string | null; price_cents: number; starts_at: string | null; ends_at: string | null; sort_order: number }[]>();
  for (const ph of phaseRows ?? []) {
    const arr = phasesByType.get(ph.ticket_type_id) ?? [];
    arr.push({ name: ph.name, price_cents: ph.price_cents, starts_at: ph.starts_at, ends_at: ph.ends_at, sort_order: ph.sort_order });
    phasesByType.set(ph.ticket_type_id, arr);
  }

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
      phases: phasesByType.get(t.id) ?? [],
      // Estado de agotado calculado SERVER-side; capacity/sold no salen al cliente.
      soldOut: !t.is_unlimited && (t.capacity - t.sold) <= 0,
      // "Quedan pocas": mismo criterio, misma regla — el NÚMERO no sale al
      // cliente, solo el booleano. Umbral 10% del aforo del tipo, con piso de
      // 1 (si el aforo es chico, 10% redondea a 0 y nunca avisaría).
      // Un tipo ilimitado nunca queda "pocas"; uno agotado tampoco (ya dice
      // "Agotada", que es más fuerte).
      pocas: (() => {
        if (t.is_unlimited) return false;
        const quedan = t.capacity - t.sold;
        if (quedan <= 0) return false;
        return quedan <= Math.max(1, Math.ceil(t.capacity * 0.1));
      })(),
    };
  });
  // Tipos S/0 (p. ej. "Cortesía") no se ofrecen al público: se emiten desde el
  // panel. El server (reserva y checkout) aplica la misma regla en
  // lib/publicTicketGuard — esto es solo la presentación.
  const publicTicketTypes = ticketTypesWithPhase.filter((t) =>
    isPubliclyOffered(t.active_price_cents, { eventoEsGratis: event.is_free === true, esCortesia: t.is_courtesy === true })
  );

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
    ticketTypes: publicTicketTypes,
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

  // Guarda de evento pasado: un link viejo de un evento ya terminado NO debe
  // dejar comprar. Si hay ends_at usamos eso; si no, 18h tras el inicio.
  // El corte REAL vive en startCheckout (server): esto es la cara visible.
  // El fallback de 18h tiene que seguir IGUAL al de startCheckout — si se
  // cambia uno sin el otro, la pantalla y el corte real se desincronizan.
  // El razonamiento detrás del número está documentado allá.
  const overAt = event.ends_at ? Date.parse(event.ends_at) : Date.parse(event.starts_at) + 18 * 3600 * 1000;
  const ended = Number.isFinite(overAt) && overAt < Date.now();
  if (ended) {
    return (
      <main className="c-state">
        <span className="c-eyebrow">{brand.name}</span>
        <h1 className="c-h1" style={{ fontSize: 30, marginTop: 8 }}>Este evento ya terminó</h1>
        <p className="c-muted" style={{ marginTop: 10 }}>Mira los próximos eventos de {brand.name}.</p>
        <div style={{ marginTop: 20 }}>
          <a className="c-btn c-btn--brand" href="/">Ver otros eventos</a>
        </div>
      </main>
    );
  }

  // B5 — link propio por promotor: ?ref=CÓDIGO pre-rellena el campo de RR.PP.
  // Solo prefill (la lógica de promo no cambia); si es inválido, el campo es
  // editable y el checkout no se rompe. Sanitizamos a [A-Za-z0-9_-] máx 32.
  const refRaw = Array.isArray(searchParams?.ref) ? searchParams?.ref[0] : searchParams?.ref;
  const refCode = (refRaw ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);

  // Concepto de diseño a evaluar (?c=1|2|3, con ?v= como alias viejo).
  // Solo presentación: no toca precio, stock, pago ni emisión.
  const concepto = leerConcepto(searchParams, params.brand);

  // ?flyer=<slug> — AYUDA DE PREVIEW: pinta el evento con el flyer de otra
  // marca para comparar cómo responde cada concepto a paletas distintas (un
  // degradado oscuro, una captura de Instagram, un fondo plano). El valor es
  // un SLUG, no una URL: la imagen sale de nuestra propia base, así que no se
  // puede apuntar a un host de afuera.
  //
  // Solo vive en el preview y en local. En parygo.com queda inerte: si no,
  // cualquiera podría linkear el evento de una marca con el arte de otra.
  const host = headers().get('host') ?? '';
  const esPreview = host.endsWith('.pages.dev') || host.startsWith('localhost');
  const flyerRaw = Array.isArray(searchParams?.flyer) ? searchParams?.flyer[0] : searchParams?.flyer;
  const flyerSlug = (flyerRaw ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  let coverUrl = event.cover_url;
  if (esPreview && flyerSlug && flyerSlug !== brand.slug) {
    // Se usa el cliente de servicio porque los eventos de las marcas que
    // sirven de muestra están despublicados y RLS los esconde del cliente
    // anónimo, que es justo lo que tiene que hacer. Acá solo se lee UNA
    // columna —la URL de una imagen de nuestro propio bucket— y solo cuando
    // el host es el preview o localhost.
    const admin2 = createAdminClient();
    const { data: otraMarca } = await admin2.from('brands').select('id').eq('slug', flyerSlug).maybeSingle();
    if (otraMarca?.id) {
      const { data: otra } = await admin2
        .from('events')
        .select('cover_url')
        .eq('brand_id', otraMarca.id)
        .not('cover_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (otra?.cover_url) coverUrl = otra.cover_url;
    }
  }
  const eventoParaPintar = { ...event, cover_url: coverUrl };

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

      <article className={`c-checkout-canvas b-c${concepto}`} style={{ paddingBottom: 64 }}>
        {/* ENTRADA apoya el boleto sobre su propio flyer, difuminado. Va
            FUERA de la sección de compra: dentro, el z-index de la sección
            lo dejaba por encima del fondo blanco del boleto. */}
        {concepto === 2 && <FondoFlyer url={optimizedImage(eventoParaPintar.cover_url, { width: 900, quality: 60 })} />}
        {/* CHECKOUT (hero, entradas, datos/pago, resumen y "dónde" viven en el panel) */}
        <EventCheckoutPanel
          brand={brand}
          event={eventoParaPintar}
          ticketTypes={panelTypes}
          mpConfigured={mpConfigured}
          mpPublicKey={mpPublicKey}
          refCode={refCode}
          shareUrl={shareUrl}
          concepto={concepto}
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
