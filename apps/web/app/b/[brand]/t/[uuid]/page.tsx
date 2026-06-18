import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MapPin, Calendar, Check } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateQrSvg } from '@/lib/qr';
import { optimizedImage } from '@/lib/imageUrl';
import { formatEventDate, whatsappLink } from '@/lib/utils';
import { DownloadQrButton } from '../../DownloadQrButton';

// SVG QR generation has no Node-only dependencies (no pngjs/Buffer), so this
// route runs fine on Cloudflare Pages edge runtime.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Props = {
  params: { brand: string; uuid: string };
};

type BrandTheme = {
  primary_color?: string;
  secondary_color?: string;
  logo_url?: string | null;
  cover_url?: string | null;
};

type TicketView = {
  id: string;
  qr_code: string;
  ticket_type_name: string;
  ticket_number: string;
  attendee_name: string | null;
  validated_at: string | null;
  invalidated_at: string | null;
  event: { name: string; starts_at: string; venue_name: string | null; venue_address: string | null; cover_url: string | null; cancelled_at: string | null } | null;
  brand: {
    slug: string;
    name: string;
    whatsapp_e164: string | null;
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
      event:events ( name, starts_at, venue_name, venue_address, cover_url, cancelled_at ),
      brand:brands ( slug, name, whatsapp_e164, theme_json )
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
      <main className="c-state">
        <span className="c-eyebrow" style={{ color: 'var(--alert)' }}>Entrada invalidada</span>
        <h1 className="c-h1" style={{ fontSize: 28, marginTop: 8 }}>Esta entrada ya no es válida</h1>
        <p className="c-muted" style={{ marginTop: 10 }}>Fue devuelta o cancelada. Contacta al promotor si crees que es un error.</p>
      </main>
    );
  }

  const qrSvg = await generateQrSvg(t.qr_code);
  const ticketUrl = `https://${brand?.slug}.parygo.com/t/${t.qr_code}`;

  return (
    <main className="c-ticket" style={{ padding: '28px 16px 48px' }}>
      {event?.cancelled_at && (
        <div style={{ background: 'var(--alert-bg)', color: 'var(--alert)', border: '1px solid var(--alert)', borderRadius: 12, padding: '12px 14px', marginBottom: 16, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>
          Este evento fue cancelado. Te avisamos por email; coordiná la devolución con el organizador.
        </div>
      )}
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <span className="c-eyebrow">Entrada digital</span>
        {t.validated_at && (
          <p style={{ marginTop: 10 }}><span className="c-validated"><Check className="h-3.5 w-3.5" /> Validada · {new Date(t.validated_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</span></p>
        )}
      </div>

      <article className="c-ticket__card">
        {/* Arte del evento como cabecera del ticket + logo de la marca → la
            entrada se siente del evento, no genérica. Cae a la banda de color. */}
        {event?.cover_url ? (
          <div className="c-ticket__art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={optimizedImage(event.cover_url, { width: 840, quality: 78 })} alt="" decoding="async" />
            <div className="c-ticket__art-veil" />
            {brand?.theme_json?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="c-ticket__logo" src={optimizedImage(brand.theme_json.logo_url, { width: 200, quality: 82 })} alt={brand.name} decoding="async" />
            )}
          </div>
        ) : (
          <div className="c-ticket__band" />
        )}
        <div style={{ padding: '20px 24px 0' }}>
          <p className="c-eyebrow">{t.ticket_type_name}</p>
          <h1 className="c-h1" style={{ fontSize: 25, marginTop: 4 }}>{event?.name}</h1>
          {event?.starts_at && <p className="c-muted" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 14 }}><Calendar className="h-3.5 w-3.5" /> {formatEventDate(event.starts_at)}</p>}
          {event?.venue_name && <p className="c-muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}><MapPin className="h-3.5 w-3.5" /> {event.venue_name}</p>}
        </div>

        <div style={{ display: 'flex', gap: 24, padding: '16px 24px 0' }}>
          <div>
            <p className="c-muted-3" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Asistente</p>
            <p style={{ fontWeight: 700, marginTop: 2 }}>{t.attendee_name ?? '—'}</p>
          </div>
          <div>
            <p className="c-muted-3" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Código</p>
            <p style={{ fontWeight: 600, marginTop: 2, letterSpacing: '0.04em' }}>{t.ticket_number}</p>
          </div>
        </div>

        <div className="c-ticket__perf" style={{ margin: '20px 0 0' }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 24px 26px' }}>
          <div className="c-qr" role="img" aria-label="QR de la entrada" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="c-muted-3" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Escanear en puerta</p>
          <DownloadQrButton qrCode={t.qr_code} fileName={t.ticket_number} />
        </div>
      </article>

      {brand?.whatsapp_e164 && (
        <div style={{ marginTop: 18 }}>
          <a href={whatsappLink(brand.whatsapp_e164.replace(/[^\d]/g, ''), `Mi entrada para ${event?.name}: ${ticketUrl}`)} target="_blank" rel="noopener noreferrer" className="c-btn c-btn--brand c-btn--block">
            📲 Enviarme por WhatsApp
          </a>
          <p className="c-muted-3" style={{ textAlign: 'center', fontSize: 12.5, marginTop: 10 }}>
            ¿Problema? <a href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>WhatsApp soporte</a>
          </p>
        </div>
      )}
    </main>
  );
}
