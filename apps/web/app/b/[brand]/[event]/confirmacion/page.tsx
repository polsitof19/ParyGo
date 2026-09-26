import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, ArrowRight, MapPin, Ticket as TicketIcon } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateQrSvg } from '@/lib/qr';
import { formatPEN, formatEventDate } from '@/lib/utils';
import { ConfirmationPoller } from './ConfirmationPoller';
import { AddToCalendar } from './AddToCalendar';
import { TicketPass } from '../../TicketPass';
import { LineaPago } from '../../Responsable';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: { brand: string; event: string };
  searchParams: { order?: string; pendiente?: string; c?: string; v?: string };
}) {
  if (!searchParams.order || !UUID_RE.test(searchParams.order)) notFound();

  const admin = createAdminClient();
  type OrderWithJoins = {
    id: string;
    status: string;
    payment_method: 'mercadopago' | 'yape_manual';
    total_cents: number;
    buyer_name: string;
    event: { name: string; starts_at: string; ends_at: string | null; venue_name: string | null; venue_address: string | null; venue_maps_url: string | null; venue_lat: number | null; venue_lng: number | null; require_dni: boolean } | null;
    brand: { slug: string; name: string; whatsapp_e164: string | null; contact_email: string | null; theme_json: { logo_url?: string | null } | null } | null;
    tickets: { id: string; qr_code: string; ticket_type_name: string }[];
  };
  const orderResult = await admin
    .from('orders')
    .select(`
      id, status, payment_method, total_cents,
      buyer_name,
      event:events ( name, starts_at, ends_at, venue_name, venue_address, venue_maps_url, venue_lat, venue_lng, require_dni ),
      brand:brands ( slug, name, whatsapp_e164, contact_email, theme_json ),
      tickets ( id, qr_code, ticket_type_name )
    `)
    .eq('id', searchParams.order)
    .maybeSingle();
  const order = orderResult.data as unknown as OrderWithJoins | null;

  if (!order) notFound();
  // Defensa: el subdominio debe coincidir con la marca de la orden (igual que
  // /t/ y /pedido). Evita ver confirmaciones de otra marca aunque se adivine el id.
  if (order.brand?.slug !== params.brand) notFound();

  const event = order.event;
  const brand = order.brand;

  // Pago MP que terminó RECHAZADO/cancelado: no es "pendiente" → mostramos error
  // accionable en vez de un spinner eterno.
  const isFailed =
    order.payment_method === 'mercadopago' &&
    ['failed', 'rejected', 'cancelled'].includes(order.status);
  const isPending =
    !isFailed &&
    (searchParams.pendiente === '1' ||
      (order.status !== 'paid' && order.payment_method === 'mercadopago'));
  const isYapeReview =
    order.status === 'pending_yape_review' && order.payment_method === 'yape_manual';
  // Yape RECHAZADO: la orden quedó en failed/rejected/cancelled con método Yape.
  // Antes caía en la vista "pagado" sin tickets (mostraba "en camino" por error).
  const isYapeRejected =
    order.payment_method === 'yape_manual' &&
    ['failed', 'rejected', 'cancelled'].includes(order.status);

  if (isFailed) {
    return (
      <main className="c-state c-checkout-canvas">
        <span className="c-eyebrow c-state__dot c-state__dot--alert">Pago no aprobado</span>
        <h1 className="c-h1">No pudimos confirmar tu pago</h1>
        <p className="c-muted">
          MercadoPago no aprobó el pago. No se generó ningún cargo definitivo. Puedes intentar de nuevo con otro método o tarjeta.
        </p>
        <a href="/" className="c-btn c-btn--brand">Volver a intentar</a>
        {brand?.whatsapp_e164 && (
          <p><a href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" className="c-state__link">¿Necesitas ayuda? Escríbenos por WhatsApp</a></p>
        )}
      </main>
    );
  }

  if (isPending) {
    return (
      <main className="c-state c-checkout-canvas">
        <div className="c-state__spinner" />
        <span className="c-eyebrow">Procesando pago</span>
        <h1 className="c-h1">Estamos confirmando tu pago</h1>
        <p className="c-muted">
          Suele tardar menos de 1 minuto. Esta página se actualiza sola. Si pasan más de 5 minutos sin novedad, escríbenos por WhatsApp.
        </p>
        {brand?.whatsapp_e164 && (
          <p><a href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" className="c-state__link">Escríbenos por WhatsApp</a></p>
        )}
        <ConfirmationPoller />
      </main>
    );
  }

  if (isYapeReview) {
    return (
      <main className="c-state c-checkout-canvas">
        <span className="c-eyebrow c-state__dot c-state__dot--warn">Comprobante en revisión</span>
        <h1 className="c-h1">Tu Yape está en revisión</h1>
        <p className="c-muted">
          Te avisamos por email apenas {brand?.name ?? 'el organizador'} lo apruebe. Suele tomar entre 5 y 15 minutos en horario de atención.
        </p>
        {brand?.whatsapp_e164 && (
          <p><a href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" className="c-state__link">¿Pasó algo? Escríbenos por WhatsApp</a></p>
        )}
      </main>
    );
  }

  if (isYapeRejected) {
    return (
      <main className="c-state c-checkout-canvas">
        <span className="c-eyebrow c-state__dot c-state__dot--alert">Comprobante rechazado</span>
        <h1 className="c-h1">No pudimos validar tu Yape</h1>
        <p className="c-muted">
          {brand?.name ?? 'El promotor'} no pudo confirmar tu comprobante, así que no se emitió ninguna entrada y no quedó ningún cargo de nuestra parte. Si crees que es un error, escribe al organizador con tu comprobante a mano.
        </p>
        {brand?.whatsapp_e164 && (
          <p><a href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" className="c-state__link">Escribir al organizador por WhatsApp</a></p>
        )}
      </main>
    );
  }

  // Pagado + tickets emitidos → la entrada, arriba de todo.
  const tickets = order.tickets ?? [];
  const firstTicket = tickets[0];
  // QR inline: el mismo generador que /t. Mismo control de acceso que arriba
  // (brand.slug === params.brand). El payload va solo dentro del QR.
  const qrSvg = firstTicket ? await generateQrSvg(firstTicket.qr_code) : null;
  const isMulti = tickets.length > 1;
  const brandLogoUrl = brand?.theme_json?.logo_url ?? null;

  // "Cómo llegar": mismo criterio que la página del evento (maps_url > coords > dirección).
  const mapsHref = event?.venue_maps_url?.startsWith('https://')
    ? event.venue_maps_url
    : event?.venue_lat && event?.venue_lng
      ? `https://www.google.com/maps/search/?api=1&query=${event.venue_lat},${event.venue_lng}`
      : event?.venue_address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue_address)}`
        : null;
  const calDetails = `Tu entrada para ${event?.name ?? 'el evento'}. Lleva ${event?.require_dni ? 'tu documento de identidad y ' : ''}tu QR (te llegó por email). Entrada por ParyGo.`;

  return (
    <main className="c-narrow c-checkout-canvas" style={{ paddingBottom: 'var(--b-s5)' }}>
      <div className="c-confirm">
        <span className="c-eyebrow c-state__dot c-state__dot--ok">Compra confirmada</span>
        <h1 className="c-h1">Tu entrada está lista</h1>
        <p className="c-muted">{event?.name}{event?.starts_at ? ` · ${formatEventDate(event.starts_at)}` : ''}</p>
      </div>

      {/* La ENTRADA, no un recibo: la misma pieza que vive en /t/[uuid]. */}
      {firstTicket && qrSvg && (
        <div style={{ marginTop: 'var(--b-s4)' }}>
          {isMulti && <p className="c-eyebrow c-ticket__n">Entrada 1 de {tickets.length}</p>}
          <TicketPass
            qrSvg={qrSvg}
            qrCode={firstTicket.qr_code}
            ticketTypeName={firstTicket.ticket_type_name}
            attendeeName={order.buyer_name}
            eventName={event?.name ?? 'Tu entrada'}
            startsAt={event?.starts_at ?? null}
            venueName={event?.venue_name ?? null}
            brandName={brand?.name ?? 'parygo'}
            brandLogoUrl={brandLogoUrl}
            brandWhatsapp={brand?.whatsapp_e164 ?? null}
            showFooter={false}
            n={isMulti ? 1 : undefined}
          />
          {isMulti && (
            <p style={{ marginTop: 'var(--b-s2)' }}>
              <Link href={`/pedido/${order.id}`} className="c-btn c-btn--soft c-btn--block">
                Ver mis {tickets.length} entradas <ArrowRight aria-hidden="true" />
              </Link>
            </p>
          )}
        </div>
      )}

      {/* ----- Secundario, más quieto, debajo del QR ----- */}
      <section className="c-bloque">
        <p className="c-eyebrow">Antes de ir</p>
        {event?.starts_at && (
          <AddToCalendar
            title={event.name}
            startIso={event.starts_at}
            endIso={event.ends_at}
            location={[event.venue_name, event.venue_address].filter(Boolean).join(', ') || null}
            details={calDetails}
            uid={order.id}
          />
        )}
        {mapsHref && (
          <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="b-link">
            Cómo llegar{event?.venue_name ? ` · ${event.venue_name}` : ''} →
          </a>
        )}
        <ul className="c-lista">
          <li><TicketIcon aria-hidden="true" /> También te mandamos tu entrada por email. Puede demorar unos minutos.</li>
          {event?.require_dni && (
            <li><Check aria-hidden="true" /> Lleva tu documento de identidad: te lo pueden pedir en la puerta.</li>
          )}
          {!mapsHref && event?.venue_name && <li><MapPin aria-hidden="true" /> {event.venue_name}</li>}
        </ul>
      </section>

      <section className="c-bloque">
        <p className="c-eyebrow">Resumen</p>
        <p className="c-fila"><span>A nombre de</span><b>{order.buyer_name}</b></p>
        <p className="c-fila"><span>{tickets.length === 1 ? '1 entrada' : `${tickets.length} entradas`}</span><b>{formatPEN(order.total_cents)}</b></p>
      </section>

      <p className="c-muted-3" style={{ marginTop: 'var(--b-s3)' }}>
        El QR de arriba ya es tu entrada: guárdalo como imagen.{' '}
        <Link href="/reenviar" className="c-inlink">Buscar mis entradas por email</Link>
      </p>

      {/* Quién cobró y quién responde por el evento. */}
      {brand && <LineaPago marca={brand} evento={event?.name} className="b-legal" />}
    </main>
  );
}
