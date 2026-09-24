import { notFound, redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';
import { YapeUploadForm } from './YapeUploadForm';
import { CopyButton } from './CopyButton';
import { DownloadQrButton } from './DownloadQrButton';
import { LineaPago } from '../../Responsable';
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
  searchParams: { order?: string; c?: string; v?: string };
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
      contact_email: string | null;
      theme_json: { yape_qr_url?: string | null } | null;
      yape_qr_url: string | null;
    } | null;
    event: { name: string; slug: string } | null;
  };

  const res = await admin
    .from('orders')
    .select(`
      id, status, total_cents, buyer_name, payment_method,
      brand:brands ( slug, name, yape_number, yape_holder, whatsapp_e164, contact_email, theme_json, yape_qr_url ),
      event:events ( name, slug )
    `)
    .eq('id', searchParams.order)
    .maybeSingle();
  const order = res.data as unknown as OrderView | null;
  if (!order) notFound();
  // Defensa en profundidad: el subdominio tiene que ser el de la marca de la
  // orden, igual que en /confirmacion y /t/. El gate real sigue siendo el UUID
  // de la orden (no enumerable), pero esta página muestra datos de la marca
  // —nombre, Yape, contacto— y no hay razón para servirlos bajo otro
  // subdominio. Faltaba desde siempre; las otras tres páginas sí lo tenían.
  if (order.brand?.slug !== params.brand) notFound();

  // If already submitted, redirect to confirmation flow.
  if (order.status !== 'pending_yape_review' || order.payment_method !== 'yape_manual') {
    redirect(`/${params.event}/confirmacion?order=${order.id}`);
  }
  if (!order.brand?.yape_number) {
    return (
      <main className="c-state c-checkout-canvas"><p className="c-state__dot c-state__dot--alert">Este organizador no tiene Yape configurado.</p></main>
    );
  }

  // El QR vive en la columna desde la 0054. theme_json se lee como respaldo por
  // si alguna marca lo tuviera de antes; sin QR, el comprador yapea al número.
  const qrUrl = order.brand.yape_qr_url ?? order.brand.theme_json?.yape_qr_url ?? null;

  return (
    <main className="b-buy b-yape c-checkout-canvas">
      <div className="b-head">
        <h1 className="b-head__t">Yapea y sube tu captura</h1>
        <p className="b-head__s">{order.event?.name}</p>
      </div>

      {/* 1 · A quién le yapeas: el QR del organizador (brands.yape_qr_url,
          0054; theme_json como respaldo) y su número. Sin QR se yapea al
          número, que funciona igual: el QR es una comodidad. */}
      <div className="b-panel">
        <p className="b-panel__t">Yapea a</p>
        <div className={`b-yapecard${qrUrl ? '' : ' b-yapecard--sinqr'}`}>
          {qrUrl && (
            <a href={qrUrl} target="_blank" rel="noopener noreferrer" className="b-yapeqr" aria-label="Abrir el QR de Yape en grande">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt={`QR de Yape de ${order.brand.yape_holder ?? order.brand.name}`} />
            </a>
          )}
          <div>
            <p className="b-yapenum">{order.brand.yape_number}</p>
            <p className="b-yapeheld">{order.brand.yape_holder ?? order.brand.name}</p>
            <div className="b-yapeacts">
              <CopyButton value={order.brand.yape_number} label="número" />
              {qrUrl && <DownloadQrButton url={qrUrl} nombre={`yape-${order.brand.slug}`} />}
            </div>
            {qrUrl && <p className="b-aviso">Guarda el QR y, al escanear en Yape, elígelo desde tu galería.</p>}
          </div>
        </div>
      </div>

      {/* 2 · El monto exacto: el dato que se copia, el más grande. */}
      <div className="b-panel">
        <p className="b-panel__t">El monto exacto</p>
        <div className="b-monto">
          <span>{formatPEN(order.total_cents)}</span>
          <CopyButton value={(order.total_cents / 100).toFixed(2)} label="monto" />
        </div>
        <p className="b-aviso">Si yapeas de menos o de más, el organizador puede rechazar el comprobante.</p>
      </div>

      {/* 3 · El comprobante. */}
      <div className="b-panel">
        <p className="b-panel__t">Tu comprobante</p>
        <YapeUploadForm
          orderId={order.id}
          brandId={order.brand.slug}
          expectedAmountCents={order.total_cents}
          buyerName={order.buyer_name}
          appUrl={publicEnv.NEXT_PUBLIC_APP_URL}
        />
      </div>

      {/* A dónde va la plata y a quién escribirle: ParyGo no cobra la entrada,
          el Yape entra directo a la cuenta del organizador. */}
      <LineaPago marca={order.brand} evento={order.event?.name} className="b-legal" />
    </main>
  );
}
