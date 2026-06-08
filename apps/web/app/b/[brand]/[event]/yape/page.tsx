import { notFound, redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';
import { YapeUploadForm } from './YapeUploadForm';
import { publicEnv } from '@/lib/env';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pago con Yape',
  robots: { index: false, follow: false },
};

export default async function YapeUploadPage({
  params,
  searchParams,
}: {
  params: { brand: string; event: string };
  searchParams: { order?: string };
}) {
  if (!searchParams.order) notFound();
  const admin = createAdminClient();

  type OrderView = {
    id: string;
    status: string;
    total_cents: number;
    buyer_name: string;
    payment_method: string;
    brand: {
      slug: string;
      name: string;
      yape_number: string | null;
      yape_holder: string | null;
      whatsapp_e164: string | null;
    } | null;
    event: { name: string; slug: string } | null;
  };

  const res = await admin
    .from('orders')
    .select(`
      id, status, total_cents, buyer_name, payment_method,
      brand:brands ( slug, name, yape_number, yape_holder, whatsapp_e164 ),
      event:events ( name, slug )
    `)
    .eq('id', searchParams.order)
    .maybeSingle();
  const order = res.data as unknown as OrderView | null;
  if (!order) notFound();

  // If already submitted, redirect to confirmation flow.
  if (order.status !== 'pending_yape_review' || order.payment_method !== 'yape_manual') {
    redirect(`/${params.event}/confirmacion?order=${order.id}`);
  }
  if (!order.brand?.yape_number) {
    return (
      <main className="c-state"><p style={{ color: 'var(--alert)' }}>Este promotor no tiene Yape configurado.</p></main>
    );
  }

  return (
    <main className="c-narrow" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <div style={{ textAlign: 'center' }}>
        <span className="c-eyebrow">Pago con Yape</span>
        <h1 className="c-h1" style={{ fontSize: 28, marginTop: 8 }}>
          Yapeá {formatPEN(order.total_cents)} a {order.brand.yape_holder ?? order.brand.name}
        </h1>
        <p className="c-muted" style={{ marginTop: 8 }}>
          Yapeá al número de abajo y después subí los datos del comprobante. Te mandamos tu QR cuando el promotor confirme.
        </p>
      </div>

      <div className="c-card" style={{ marginTop: 22 }}>
        <p className="c-card__title">1 · Yapeá a este número</p>
        <p style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 'clamp(34px,9vw,46px)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--brand)' }}>{order.brand.yape_number}</p>
        <p className="c-muted" style={{ marginTop: 6 }}>Titular: <strong style={{ color: 'var(--ink)' }}>{order.brand.yape_holder ?? order.brand.name}</strong></p>
        <p className="c-muted">Monto exacto: <strong style={{ color: 'var(--ink)' }}>{formatPEN(order.total_cents)}</strong></p>
        <p style={{ marginTop: 12, borderRadius: 'var(--r-ctl)', background: 'var(--warn-bg)', color: 'var(--warn)', padding: '11px 14px', fontSize: 13, fontWeight: 500 }}>
          ⚠️ Yapeá el monto exacto. Si yapeás de menos o de más, el promotor puede rechazar el comprobante.
        </p>
      </div>

      <div className="c-card" style={{ marginTop: 14 }}>
        <p className="c-card__title">2 · Subí los datos del comprobante</p>
        <p className="c-muted" style={{ marginBottom: 14 }}>Después de yapear, abrí &quot;Movimientos&quot; en tu app Yape, abrí esta transferencia y copiá los datos. También adjuntá la captura.</p>
        <YapeUploadForm
          orderId={order.id}
          brandId={order.brand.slug}
          expectedAmountCents={order.total_cents}
          buyerName={order.buyer_name}
          appUrl={publicEnv.NEXT_PUBLIC_APP_URL}
        />
      </div>

      {order.brand.whatsapp_e164 && (
        <p className="c-foot">
          ¿Algún problema? <a href={`https://wa.me/${order.brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)', fontWeight: 600 }}>WhatsApp soporte</a>
        </p>
      )}
    </main>
  );
}
