import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, Mail, ArrowRight, MapPin, Ticket as TicketIcon, ExternalLink } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateQrSvg } from '@/lib/qr';
import { formatPEN, formatEventDate, whatsappLink } from '@/lib/utils';
import { ConfirmationPoller } from './ConfirmationPoller';
import { AddToCalendar } from './AddToCalendar';
import { DownloadQrButton } from '../../DownloadQrButton';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: { brand: string; event: string };
  searchParams: { order?: string; pendiente?: string };
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
    brand: { slug: string; name: string; whatsapp_e164: string | null } | null;
    tickets: { id: string; qr_code: string; ticket_type_name: string; ticket_number: string }[];
  };
  const orderResult = await admin
    .from('orders')
    .select(`
      id, status, payment_method, total_cents,
      buyer_name,
      event:events ( name, starts_at, ends_at, venue_name, venue_address, venue_maps_url, venue_lat, venue_lng, require_dni ),
      brand:brands ( slug, name, whatsapp_e164 ),
      tickets ( id, qr_code, ticket_type_name, ticket_number )
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
        <div className="c-confirm__badge" style={{ background: 'var(--alert-bg, rgba(220,38,38,.1))', color: 'var(--alert, #dc2626)' }}><Mail className="h-8 w-8" /></div>
        <span className="c-eyebrow" style={{ color: 'var(--alert, #dc2626)', marginTop: 16, display: 'block' }}>Pago no aprobado</span>
        <h1 className="c-h1" style={{ fontSize: 30, marginTop: 8 }}>No pudimos confirmar tu pago</h1>
        <p className="c-muted" style={{ marginTop: 10 }}>
          MercadoPago no aprobó el pago. No se generó ningún cargo definitivo. Podés intentar de nuevo con otro método o tarjeta.
        </p>
        <a href="/" className="c-btn c-btn--brand" style={{ marginTop: 18 }}>Volver a intentar</a>
        {brand?.whatsapp_e164 && (
          <a href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 14, color: 'var(--brand-ink)', fontWeight: 600 }}>¿Necesitás ayuda? WhatsApp soporte</a>
        )}
      </main>
    );
  }

  if (isPending) {
    return (
      <main className="c-state c-checkout-canvas">
        <div className="c-state__spinner" />
        <span className="c-eyebrow">Procesando pago</span>
        <h1 className="c-h1" style={{ fontSize: 30, marginTop: 8 }}>Estamos confirmando tu pago</h1>
        <p className="c-muted" style={{ marginTop: 10 }}>
          Suele tardar menos de 1 minuto. Esta página se actualiza sola. Si pasan más de 5 minutos sin novedad, escribinos por WhatsApp.
        </p>
        {brand?.whatsapp_e164 && (
          <a href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 16, color: 'var(--brand-ink)', fontWeight: 600 }}>WhatsApp soporte</a>
        )}
        <ConfirmationPoller />
      </main>
    );
  }

  if (isYapeReview) {
    return (
      <main className="c-state c-checkout-canvas">
        <div className="c-confirm__badge" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}><Mail className="h-8 w-8" /></div>
        <span className="c-eyebrow" style={{ color: 'var(--warn)', marginTop: 16, display: 'block' }}>Comprobante en revisión</span>
        <h1 className="c-h1" style={{ fontSize: 30, marginTop: 8 }}>Tu Yape se está verificando</h1>
        <p className="c-muted" style={{ marginTop: 10 }}>
          {brand?.name ?? 'El promotor'} está revisando tu comprobante. Te avisamos por email + WhatsApp apenas se apruebe. Suele tomar 5–15 minutos en horario operativo.
        </p>
        {brand?.whatsapp_e164 && (
          <a href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 16, color: 'var(--brand-ink)', fontWeight: 600 }}>¿Pasó algo? WhatsApp soporte</a>
        )}
      </main>
    );
  }

  if (isYapeRejected) {
    return (
      <main className="c-state c-checkout-canvas">
        <div className="c-confirm__badge" style={{ background: 'var(--alert-bg, rgba(220,38,38,.1))', color: 'var(--alert, #dc2626)' }}><Mail className="h-8 w-8" /></div>
        <span className="c-eyebrow" style={{ color: 'var(--alert, #dc2626)', marginTop: 16, display: 'block' }}>Comprobante rechazado</span>
        <h1 className="c-h1" style={{ fontSize: 30, marginTop: 8 }}>No pudimos validar tu Yape</h1>
        <p className="c-muted" style={{ marginTop: 10 }}>
          {brand?.name ?? 'El promotor'} no pudo confirmar tu comprobante, así que no se emitió ninguna entrada y no quedó ningún cargo de nuestra parte. Si creés que es un error, escribí al organizador con tu comprobante a mano.
        </p>
        {brand?.whatsapp_e164 && (
          <a href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 16, color: 'var(--brand-ink)', fontWeight: 600 }}>Escribir al organizador por WhatsApp</a>
        )}
      </main>
    );
  }

  // Pagado + tickets emitidos → cierre celebratorio
  const tickets = order.tickets ?? [];
  const firstTicket = tickets[0];
  const ticketUrl = firstTicket ? `/t/${firstTicket.qr_code}` : null;
  // QR inline: reusa el mismo generador que /t. El payload es el qr_code, que ya
  // está en el payload de esta página (link permanente, ticketUrl, WhatsApp) →
  // no expone datos nuevos. Mismo control de acceso que arriba (brand.slug === params.brand).
  const qrSvg = firstTicket ? await generateQrSvg(firstTicket.qr_code) : null;
  const isMulti = tickets.length > 1;

  // "Cómo llegar": mismo criterio que la página del evento (maps_url > coords > dirección).
  const mapsHref = event?.venue_maps_url?.startsWith('https://')
    ? event.venue_maps_url
    : event?.venue_lat && event?.venue_lng
      ? `https://www.google.com/maps/search/?api=1&query=${event.venue_lat},${event.venue_lng}`
      : event?.venue_address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue_address)}`
        : null;
  const calDetails = `Tu entrada para ${event?.name ?? 'el evento'}. Llevá ${event?.require_dni ? 'tu documento de identidad y ' : ''}tu QR (te llegó por email). Entrada por ParyGo.`;

  return (
    <main className="c-narrow c-checkout-canvas" style={{ paddingTop: 40, paddingBottom: 56 }}>
      <div className="c-confirm">
        <div className="c-confirm__badge"><Check className="h-9 w-9" /></div>
        <span className="c-eyebrow" style={{ color: 'var(--ok)' }}>¡Compra confirmada!</span>
        <h1>¡Tu entrada está lista!</h1>
        <p className="c-muted">{event?.name}{event?.starts_at ? ` · ${formatEventDate(event.starts_at)}` : ''}</p>
      </div>

      {/* HERO: el QR es lo único importante en esta pantalla. */}
      {firstTicket && qrSvg && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 26 }}>
          {isMulti && (
            <span className="c-eyebrow" style={{ color: 'var(--ink-2)' }}>
              Entrada 1 de {tickets.length} · {firstTicket.ticket_type_name}
            </span>
          )}
          <div className="c-qr" role="img" aria-label="QR de tu entrada" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p style={{ fontWeight: 700, fontSize: 16, textAlign: 'center' }}>Mostrá este QR en la puerta.</p>
          {isMulti ? (
            <Link href={`/pedido/${order.id}`} className="c-btn c-btn--brand">
              Ver mis {tickets.length} entradas <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <DownloadQrButton qrCode={firstTicket.qr_code} fileName={firstTicket.ticket_number} />
          )}
        </div>
      )}

      {/* ----- Secundario, más quieto, debajo del QR ----- */}

      {/* Antes de ir: calendario + cómo llegar + qué llevar */}
      <div className="c-card" style={{ marginTop: 26 }}>
        <p className="c-card__title">Antes de ir</p>
        {event?.starts_at && (
          <div style={{ marginTop: 4, marginBottom: 12 }}>
            <AddToCalendar
              title={event.name}
              startIso={event.starts_at}
              endIso={event.ends_at}
              location={[event.venue_name, event.venue_address].filter(Boolean).join(', ') || null}
              details={calDetails}
              uid={order.id}
            />
          </div>
        )}
        {mapsHref && (
          <a href={mapsHref} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--brand-ink)', fontSize: 14 }}>
            <MapPin className="h-4 w-4" /> Cómo llegar{event?.venue_name ? ` · ${event.venue_name}` : ''} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--ink-2)' }}>
            <TicketIcon className="h-4 w-4" style={{ flexShrink: 0, marginTop: 1, color: 'var(--brand-ink)' }} />
            También tenés tu QR en el email y en tu link permanente.
          </li>
          {event?.require_dni && (
            <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--ink-2)' }}>
              <Check className="h-4 w-4" style={{ flexShrink: 0, marginTop: 1, color: 'var(--brand-ink)' }} />
              Llevá tu documento de identidad (te lo pueden pedir en la puerta).
            </li>
          )}
        </ul>
      </div>

      {/* Resumen del pedido */}
      <div className="c-card" style={{ marginTop: 16 }}>
        <p className="c-card__title">Resumen</p>
        <Row label="Comprador">{order.buyer_name}</Row>
        <Row label="Total">{formatPEN(order.total_cents)}</Row>
        <Row label="Entradas">
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {tickets.map((t) => <li key={t.id} style={{ fontSize: 13.5 }}>{t.ticket_number} · {t.ticket_type_name}</li>)}
          </ul>
        </Row>
      </div>

      {/* Link permanente + compartir: acciones de respaldo, jerarquía baja */}
      {ticketUrl && (
        <div style={{ marginTop: 16 }}>
          <p className="c-muted-3" style={{ textAlign: 'center', fontSize: 12.5, marginBottom: 10 }}>Tu link permanente (guardalo en favoritos)</p>
          <div className="c-linkpill">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>parygo.com/t/{firstTicket!.qr_code.slice(0, 8)}…</span>
            <Link href={ticketUrl} className="c-btn c-btn--soft" style={{ height: 40, padding: '0 16px' }}>Abrir <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {firstTicket && brand?.whatsapp_e164 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
              <a href={whatsappLink(brand.whatsapp_e164.replace(/[^\d]/g, ''), `Hola, te paso mi entrada para ${event?.name}: https://${brand.slug}.parygo.com/t/${firstTicket.qr_code}`)} target="_blank" rel="noopener noreferrer" className="c-btn c-btn--soft">
                📲 Enviarme a WhatsApp
              </a>
            </div>
          )}
        </div>
      )}

      <p className="c-muted-3" style={{ textAlign: 'center', fontSize: 12.5, marginTop: 18 }}>
        También te enviamos el QR por email. Si no llega en 5 min, revisá spam o usá el link permanente.{' '}
        <Link href="/reenviar" style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>¿No lo encontrás? Reenviar a mi email</Link>
      </p>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderTop: '1px solid var(--cream-2)' }}>
      <span className="c-muted-3" style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
      <span style={{ textAlign: 'right', fontSize: 14 }}>{children}</span>
    </div>
  );
}
