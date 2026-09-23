import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateQrSvg } from '@/lib/qr';
import { formatEventDate } from '@/lib/utils';
import { TicketPass } from '../../TicketPass';
import { LineaEntrada } from '../../Responsable';

// QR generado server-side, sin dependencias Node-only → corre en edge.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OrderView = {
  id: string;
  status: string;
  payment_method: 'mercadopago' | 'yape_manual';
  event: { name: string; starts_at: string; venue_name: string | null; cover_url: string | null } | null;
  brand: { slug: string; name: string; whatsapp_e164: string | null; contact_email: string | null; theme_json: { logo_url?: string | null } | null } | null;
  tickets: {
    qr_code: string;
    ticket_type_name: string;
    ticket_number: string;
    attendee_name: string | null;
    invalidated_at: string | null;
    validated_at: string | null;
  }[];
};

async function loadOrder(brandSlug: string, orderId: string): Promise<OrderView | null> {
  if (!UUID_RE.test(orderId)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from('orders')
    .select(`
      id, status, payment_method,
      event:events ( name, starts_at, venue_name, cover_url ),
      brand:brands ( slug, name, whatsapp_e164, contact_email, theme_json ),
      tickets ( qr_code, ticket_type_name, ticket_number, attendee_name, invalidated_at, validated_at )
    `)
    .eq('id', orderId)
    .maybeSingle();
  const order = data as unknown as OrderView | null;
  if (!order) return null;
  // Defensa: el subdominio debe coincidir con la marca de la orden (igual que /t/).
  if (order.brand?.slug !== brandSlug) return null;
  return order;
}

export async function generateMetadata({ params }: { params: { brand: string; orderId: string } }): Promise<Metadata> {
  const o = await loadOrder(params.brand, params.orderId);
  return { title: o?.event ? `Mis entradas · ${o.event.name}` : 'Mi pedido', robots: { index: false, follow: false } };
}

export default async function OrderPage({ params }: { params: { brand: string; orderId: string } }) {
  const order = await loadOrder(params.brand, params.orderId);
  if (!order) notFound();

  // Orden sin tickets emitidos todavía (ej. Yape en revisión).
  const tickets = (order.tickets ?? []).slice().sort((a, b) => a.ticket_number.localeCompare(b.ticket_number));
  const event = order.event;
  const brand = order.brand;

  if (tickets.length === 0) {
    const wa = order.brand?.whatsapp_e164 ? `https://wa.me/${order.brand.whatsapp_e164.replace(/[^\d]/g, '')}` : null;
    // Estado del pedido cuando aún no hay QR: distinguir en-revisión vs rechazado.
    const rejected = ['failed', 'rejected', 'cancelled'].includes(order.status);
    if (rejected) {
      return (
        <main className="c-state">
          <span className="c-eyebrow c-state__dot c-state__dot--alert">Comprobante rechazado</span>
          <h1 className="c-h1">No se emitieron entradas</h1>
          <p className="c-muted">Tu comprobante no pudo validarse, así que no hay entradas para este pedido y no quedó ningún cargo de nuestra parte. Si crees que es un error, escribe al organizador.</p>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="c-state__link">Escribir al organizador por WhatsApp</a>}
        </main>
      );
    }
    return (
      <main className="c-state">
        <span className="c-eyebrow c-state__dot c-state__dot--warn">Comprobante en revisión</span>
        <h1 className="c-h1">Estamos verificando tu Yape</h1>
        <p className="c-muted">El organizador está revisando tu comprobante. Te avisamos por email apenas se apruebe y aquí vas a ver tus QR. Suele tomar de 5 a 15 minutos en horario de atención.</p>
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="c-state__link">¿Pasó algo? Escríbenos por WhatsApp</a>}
      </main>
    );
  }

  // El SVG del QR se arma en el server (edge-safe); la imagen para guardar o
  // compartir se compone en el navegador.
  const rendered = await Promise.all(
    tickets.map(async (t) => ({ ...t, svg: await generateQrSvg(t.qr_code) }))
  );
  const logo = brand?.theme_json?.logo_url ?? null;

  return (
    <main className="c-ticket c-checkout-canvas">
      <span className="c-eyebrow">Tus entradas</span>
      <h1 className="c-h1" style={{ marginTop: 'var(--b-s1)' }}>{event?.name}</h1>
      <p className="c-muted-3" style={{ marginTop: 'var(--b-s1)' }}>
        {rendered.length === 1 ? '1 entrada' : `${rendered.length} entradas`}{event?.starts_at ? ` · ${formatEventDate(event.starts_at)}` : ''}. Un QR por persona en la puerta.
      </p>

      <div className="c-ticket__list">
        {rendered.map((t, i) => {
          const voided = !!t.invalidated_at;
          const used = !!t.validated_at;
          return (
            <div key={t.qr_code} className="c-ticket__card">
              {rendered.length > 1 && <p className="c-eyebrow c-ticket__n">Entrada {i + 1} de {rendered.length}</p>}
              <TicketPass
                qrSvg={t.svg}
                qrCode={t.qr_code}
                ticketTypeName={t.ticket_type_name}
                attendeeName={t.attendee_name}
                eventName={event?.name ?? 'Tu entrada'}
                startsAt={event?.starts_at ?? null}
                venueName={event?.venue_name ?? null}
                brandName={brand?.name ?? 'parygo'}
                brandLogoUrl={logo}
                brandWhatsapp={brand?.whatsapp_e164 ?? null}
                state={voided
                  ? { kind: 'dead', reason: 'Esta entrada fue anulada y no vale en la puerta.' }
                  : used
                    ? { kind: 'used', at: new Date(t.validated_at!).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }) }
                    : { kind: 'ok' }}
                showFooter={false}
                reenviar={false}
                n={rendered.length > 1 ? i + 1 : undefined}
              />
            </div>
          );
        })}
      </div>

      {brand && (
        <LineaEntrada marca={{ name: brand.name, whatsapp_e164: brand.whatsapp_e164, contact_email: brand.contact_email }} />
      )}
    </main>
  );
}
