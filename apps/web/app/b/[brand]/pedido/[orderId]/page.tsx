import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Calendar, MapPin, Check } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateQrSvg } from '@/lib/qr';
import { formatEventDate } from '@/lib/utils';
import { DownloadQrButton } from '../../DownloadQrButton';

// QR generado server-side, sin dependencias Node-only → corre en edge.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OrderView = {
  id: string;
  status: string;
  buyer_name: string | null;
  event: { name: string; starts_at: string; venue_name: string | null } | null;
  brand: { slug: string; name: string } | null;
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
      id, status, buyer_name,
      event:events ( name, starts_at, venue_name ),
      brand:brands ( slug, name ),
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

  if (tickets.length === 0) {
    return (
      <main className="c-state">
        <span className="c-eyebrow">Tu pedido</span>
        <h1 className="c-h1" style={{ fontSize: 26, marginTop: 8 }}>Todavía no hay entradas emitidas</h1>
        <p className="c-muted" style={{ marginTop: 10 }}>Si pagaste por Yape, tu comprobante está en revisión. Te avisamos por email apenas se apruebe.</p>
      </main>
    );
  }

  // Pre-generar el SVG del QR por entrada (edge-safe). El PNG de descarga se
  // genera en el navegador (DownloadQrButton).
  const rendered = await Promise.all(
    tickets.map(async (t) => ({ ...t, svg: await generateQrSvg(t.qr_code) }))
  );

  return (
    <main className="c-ticket" style={{ padding: '24px 16px 48px' }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <span className="c-eyebrow">Tus entradas</span>
        <h1 className="c-h1" style={{ fontSize: 24, marginTop: 6 }}>{event?.name}</h1>
        {event?.starts_at && <p className="c-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 14 }}><Calendar className="h-3.5 w-3.5" /> {formatEventDate(event.starts_at)}</p>}
        {event?.venue_name && <p className="c-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}><MapPin className="h-3.5 w-3.5" /> {event.venue_name}</p>}
        <p className="c-muted-3" style={{ fontSize: 13, marginTop: 10 }}>
          {rendered.length === 1 ? '1 entrada' : `${rendered.length} entradas`} · cada una con su QR. Mostrá un QR por persona en la puerta.
        </p>
      </div>

      <div className="s-stack" style={{ gap: 16 }}>
        {rendered.map((t, i) => {
          const used = !!t.validated_at;
          const voided = !!t.invalidated_at;
          return (
            <article key={t.qr_code} className="c-ticket__card">
              <div className="c-ticket__band" />
              <div style={{ padding: '16px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <p className="c-eyebrow">Entrada {i + 1}/{rendered.length} · {t.ticket_type_name}</p>
                {voided ? <span className="c-validated" style={{ color: 'var(--alert)' }}>Anulada</span>
                  : used ? <span className="c-validated"><Check className="h-3.5 w-3.5" /> Ya ingresó</span> : null}
              </div>
              <div style={{ padding: '4px 22px 0' }}>
                <p style={{ fontWeight: 700 }}>{t.attendee_name ?? '—'}</p>
                <p className="c-muted-3" style={{ fontSize: 12, letterSpacing: '0.04em' }}>{t.ticket_number}</p>
              </div>
              <div className="c-ticket__perf" style={{ margin: '16px 0 0' }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '18px 22px 24px' }}>
                <div className="c-qr" role="img" aria-label={`QR de la entrada ${i + 1}`} style={voided ? { opacity: 0.35, filter: 'grayscale(1)' } : undefined} dangerouslySetInnerHTML={{ __html: t.svg }} />
                {!voided && <DownloadQrButton qrCode={t.qr_code} fileName={t.ticket_number} block />}
                {voided && <p className="c-muted-3" style={{ fontSize: 12 }}>Esta entrada fue anulada y no vale en puerta.</p>}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
