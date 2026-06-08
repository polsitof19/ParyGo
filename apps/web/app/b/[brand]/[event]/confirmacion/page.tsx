import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, Mail, ArrowRight } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN, formatEventDate, whatsappLink } from '@/lib/utils';
import { ConfirmationPoller } from './ConfirmationPoller';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: { brand: string; event: string };
  searchParams: { order?: string; pendiente?: string };
}) {
  if (!searchParams.order) notFound();

  const admin = createAdminClient();
  type OrderWithJoins = {
    id: string;
    status: string;
    payment_method: 'mercadopago' | 'yape_manual';
    total_cents: number;
    buyer_name: string;
    buyer_email: string;
    buyer_phone: string;
    event: { name: string; starts_at: string; venue_name: string | null } | null;
    brand: { slug: string; name: string; whatsapp_e164: string | null } | null;
    tickets: { id: string; qr_code: string; ticket_type_name: string; ticket_number: string }[];
  };
  const orderResult = await admin
    .from('orders')
    .select(`
      id, status, payment_method, total_cents,
      buyer_name, buyer_email, buyer_phone,
      event:events ( name, starts_at, venue_name ),
      brand:brands ( slug, name, whatsapp_e164 ),
      tickets ( id, qr_code, ticket_type_name, ticket_number )
    `)
    .eq('id', searchParams.order)
    .maybeSingle();
  const order = orderResult.data as unknown as OrderWithJoins | null;

  if (!order) notFound();

  const event = order.event;
  const brand = order.brand;

  const isPending =
    searchParams.pendiente === '1' ||
    (order.status !== 'paid' && order.payment_method === 'mercadopago');
  const isYapeReview =
    order.status === 'pending_yape_review' && order.payment_method === 'yape_manual';

  if (isPending) {
    return (
      <main className="c-state">
        <div className="c-state__spinner" />
        <span className="c-eyebrow">Procesando pago</span>
        <h1 className="c-h1" style={{ fontSize: 30, marginTop: 8 }}>Estamos confirmando tu pago</h1>
        <p className="c-muted" style={{ marginTop: 10 }}>
          Suele tardar menos de 1 minuto. Esta página se actualiza sola. Si pasan más de 5 minutos sin novedad, escríbenos por WhatsApp.
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
      <main className="c-state">
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

  // Pagado + tickets emitidos → cierre celebratorio
  const tickets = order.tickets ?? [];
  const firstTicket = tickets[0];
  const ticketUrl = firstTicket ? `/t/${firstTicket.qr_code}` : null;

  return (
    <main className="c-narrow" style={{ paddingTop: 48, paddingBottom: 56 }}>
      <div className="c-confirm">
        <div className="c-confirm__badge"><Check className="h-9 w-9" /></div>
        <span className="c-eyebrow" style={{ color: 'var(--ok)' }}>¡Compra confirmada!</span>
        <h1>Tu entrada está en camino</h1>
        <p className="c-muted">{event?.name}{event?.starts_at ? ` · ${formatEventDate(event.starts_at)}` : ''}</p>
      </div>

      {ticketUrl && (
        <div style={{ marginTop: 28 }}>
          <p className="c-muted-3" style={{ textAlign: 'center', fontSize: 12.5, marginBottom: 10 }}>Tu link permanente (guardalo en favoritos)</p>
          <div className="c-linkpill">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>parygo.com/t/{firstTicket!.qr_code.slice(0, 8)}…</span>
            <Link href={ticketUrl} className="c-btn c-btn--brand" style={{ height: 40, padding: '0 16px' }}>Ver mi entrada <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      )}

      <div className="c-card" style={{ marginTop: 22 }}>
        <p className="c-card__title">Resumen</p>
        <Row label="Comprador">{order.buyer_name}</Row>
        <Row label="Email">{order.buyer_email}</Row>
        <Row label="Total">{formatPEN(order.total_cents)}</Row>
        <Row label="Entradas">
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {tickets.map((t) => <li key={t.id} style={{ fontSize: 13.5 }}>{t.ticket_number} · {t.ticket_type_name}</li>)}
          </ul>
        </Row>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 18 }}>
        {firstTicket && brand?.whatsapp_e164 && (
          <a href={whatsappLink(brand.whatsapp_e164.replace(/[^\d]/g, ''), `Hola, te paso mi entrada para ${event?.name}: https://${brand.slug}.parygo.com/t/${firstTicket.qr_code}`)} target="_blank" rel="noopener noreferrer" className="c-btn c-btn--soft">
            📲 Enviarme a WhatsApp
          </a>
        )}
        {ticketUrl && <Link href={ticketUrl} className="c-btn c-btn--soft">Ver mi QR</Link>}
      </div>

      <p className="c-muted-3" style={{ textAlign: 'center', fontSize: 12.5, marginTop: 18 }}>
        También te enviamos el QR a {order.buyer_email}. Si no llega en 5 min, revisá spam o usá el link permanente.
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
