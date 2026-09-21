import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateQrSvg } from '@/lib/qr';
import { TicketPass, type PassState } from '../../TicketPass';
import { TransferTicket } from './TransferTicket';

// SVG QR generation has no Node-only dependencies (no pngjs/Buffer), so this
// route runs fine on Cloudflare Pages edge runtime.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Props = {
  params: { brand: string; uuid: string };
};

type BrandTheme = {
  logo_url?: string | null;
};

type TicketView = {
  id: string;
  qr_code: string;
  ticket_type_name: string;
  ticket_number: string;
  attendee_name: string | null;
  validated_at: string | null;
  invalidated_at: string | null;
  event: { name: string; starts_at: string; venue_name: string | null; cancelled_at: string | null; allow_transfer: boolean } | null;
  brand: {
    slug: string;
    name: string;
    whatsapp_e164: string | null;
    contact_email: string | null;
    theme_json: BrandTheme;
  } | null;
};

async function loadTicket(brandSlug: string, qrCode: string): Promise<TicketView | null> {
  // Validate uuid v4 shape early
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(qrCode)) {
    return null;
  }
  const admin = createAdminClient();
  const res = await admin
    .from('tickets')
    .select(`
      id, qr_code, ticket_type_name, ticket_number, attendee_name, validated_at, invalidated_at,
      event:events ( name, starts_at, venue_name, cancelled_at, allow_transfer ),
      brand:brands ( slug, name, whatsapp_e164, contact_email, theme_json )
    `)
    .eq('qr_code', qrCode)
    .maybeSingle();
  const data = res.data as unknown as TicketView | null;

  if (!data) return null;
  // Reject if subdomain doesn't match the brand of the ticket (defense in depth).
  if (data.brand?.slug !== brandSlug) return null;
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await loadTicket(params.brand, params.uuid);
  if (!t) return { title: 'Entrada no encontrada' };
  return {
    title: `${t.ticket_type_name} · ${t.event?.name ?? 'Mi entrada'}`,
    robots: { index: false, follow: false },
  };
}

export default async function TicketPage({ params }: Props) {
  const t = await loadTicket(params.brand, params.uuid);
  if (!t) notFound();

  const event = t.event;
  const brand = t.brand;

  if (t.invalidated_at) {
    return (
      <main className="c-state c-checkout-canvas">
        <span className="c-eyebrow" style={{ color: 'var(--alert)' }}>Entrada invalidada</span>
        <h1 className="c-h1" style={{ fontSize: 28, marginTop: 8 }}>Esta entrada ya no es válida</h1>
        <p className="c-muted" style={{ marginTop: 10 }}>Fue devuelta o cancelada. Contacta al promotor si crees que es un error.</p>
      </main>
    );
  }

  const qrSvg = await generateQrSvg(t.qr_code);
  const ticketUrl = `https://${brand?.slug}.parygo.com/t/${t.qr_code}`;

  // Estado de la entrada, arriba de todo: si ya entró o si el evento se cayó,
  // el comprador tiene que enterarse antes de llegar a la puerta.
  const state: PassState = event?.cancelled_at
    ? { kind: 'dead', reason: 'Este evento fue cancelado. Coordina la devolución con el organizador.' }
    : t.validated_at
      ? { kind: 'used', at: new Date(t.validated_at).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }) }
      : { kind: 'ok' };

  return (
    <main className="c-checkout-canvas" style={{ maxWidth: 452, margin: '0 auto', padding: '24px 16px 48px' }}>
      <TicketPass
        qrSvg={qrSvg}
        qrCode={t.qr_code}
        ticketNumber={t.ticket_number}
        ticketTypeName={t.ticket_type_name}
        attendeeName={t.attendee_name}
        eventName={event?.name ?? 'Tu entrada'}
        startsAt={event?.starts_at ?? null}
        venueName={event?.venue_name ?? null}
        brandName={brand?.name ?? 'parygo'}
        brandLogoUrl={brand?.theme_json?.logo_url ?? null}
        brandWhatsapp={brand?.whatsapp_e164 ?? null}
        brandEmail={brand?.contact_email ?? null}
        shareUrl={ticketUrl}
        state={state}
      />
      {/* El contacto del organizador ya va en el pie de la entrada
          (LineaEntrada), así que acá no se repite. */}

      {/* Transferir/regalar: solo si el evento lo permite, no empezó, y la entrada
          sigue usable (no escaneada, no anulada, evento no cancelado). El corte al
          inicio del evento evita conflictos con el validador de puerta offline. */}
      {event?.allow_transfer && !t.validated_at && !event?.cancelled_at
        && event?.starts_at && new Date(event.starts_at).getTime() > Date.now() && (
        <TransferTicket qrCode={t.qr_code} />
      )}
    </main>
  );
}
