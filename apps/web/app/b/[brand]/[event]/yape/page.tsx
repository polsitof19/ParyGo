import { notFound, redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';
import { YapeUploadForm } from './YapeUploadForm';
import { CopyButton } from './CopyButton';
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
      theme_json: { yape_qr_url?: string | null } | null;
    } | null;
    event: { name: string; slug: string } | null;
  };

  const res = await admin
    .from('orders')
    .select(`
      id, status, total_cents, buyer_name, payment_method,
      brand:brands ( slug, name, yape_number, yape_holder, whatsapp_e164, theme_json ),
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
      <main className="c-state c-checkout-canvas"><p style={{ color: 'var(--alert)' }}>Este promotor no tiene Yape configurado.</p></main>
    );
  }

  return (
    <main className="b-buy c-checkout-canvas" style={{ paddingTop: 26 }}>
      <div className="b-blobs" aria-hidden="true"><span /><span /></div>

      <div className="b-head">
        <h1 className="b-head__t">Yapea y sube tu captura</h1>
      </div>

      {/* 1 · A quién le yapeas */}
      <div className="b-panel">
        <p className="b-panel__t">1 · Yapea a este número</p>
        <div className="b-yapenum">
          <span>{order.brand.yape_number}</span>
          <CopyButton value={order.brand.yape_number} label="número" />
        </div>
        <p className="b-yapeheld">{order.brand.yape_holder ?? order.brand.name}</p>
      </div>

      {/* 2 · El QR del organizador. El campo para subirlo llega con la próxima
             migración; hasta entonces el componente muestra su estado vacío. */}
      <div className="b-panel">
        <p className="b-panel__t">2 · O escanea su QR</p>
        {order.brand.theme_json?.yape_qr_url ? (
          <div className="b-yapeqr">
            {/* Morado Yape + nombre en TEXTO (no falsificamos el logo del BCP) */}
            <p className="b-yapeqr__t"><span aria-hidden /> Escanea con Yape</p>
            <a href={order.brand.theme_json.yape_qr_url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={order.brand.theme_json.yape_qr_url} alt={`QR de Yape de ${order.brand.yape_holder ?? order.brand.name}`} />
            </a>
            <p className="c-help" style={{ textAlign: 'center' }}>Toca el QR para ampliarlo</p>
          </div>
        ) : (
          <div className="b-yapeqr b-yapeqr--vacio">
            <span className="b-yapeqr__ph" aria-hidden="true" />
            <p>QR no disponible, yapea al número</p>
          </div>
        )}
      </div>

      {/* 3 · Monto exacto + captura */}
      <div className="b-panel">
        <p className="b-panel__t">3 · Yapea exactamente</p>
        <div className="b-monto">
          <span>{formatPEN(order.total_cents)}</span>
          <CopyButton value={(order.total_cents / 100).toFixed(2)} label="monto" />
        </div>
        <p className="b-aviso">Si yapeas de menos o de más, el organizador puede rechazar el comprobante.</p>
        <div className="c-divider" />
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
          ¿Algún problema?{' '}
          <a href={`https://wa.me/${order.brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontWeight: 700, textDecoration: 'underline' }}>
            Escribe al organizador
          </a>
        </p>
      )}
    </main>
  );
}
