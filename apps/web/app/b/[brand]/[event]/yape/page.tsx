import { notFound, redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';
import { YapeUploadForm } from './YapeUploadForm';
import { publicEnv } from '@/lib/env';

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
      <main className="container-narrow py-20 text-center">
        <p className="text-destructive">Este promotor no tiene Yape configurado.</p>
      </main>
    );
  }

  return (
    <main className="container-narrow space-y-8 py-12">
      <header className="space-y-3 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ PAGO CON YAPE · MANUAL ]
        </p>
        <h1 className="font-display text-3xl uppercase leading-none tracking-tight md:text-4xl">
          Yapea {formatPEN(order.total_cents)} a {order.brand.yape_holder ?? order.brand.name}
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          Hacé el yape al número de abajo y después subí los datos del
          comprobante. Te enviamos tu QR cuando el promotor confirme.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ 1 · YAPEÁ A ESTE NÚMERO ]
        </h2>
        <div className="space-y-2">
          <p className="font-display text-4xl tabular-nums tracking-tight text-foreground md:text-5xl">
            {order.brand.yape_number}
          </p>
          <p className="text-sm text-muted-foreground">
            Titular: <strong>{order.brand.yape_holder ?? order.brand.name}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            Monto exacto:{' '}
            <strong className="text-foreground">{formatPEN(order.total_cents)}</strong>
          </p>
        </div>
        <p className="rounded-md border border-yellow/30 bg-yellow/5 px-4 py-3 text-xs text-yellow">
          ⚠️ Yapeá el monto exacto. Si yapeás de menos o de más, el promotor
          puede rechazar el comprobante.
        </p>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ 2 · SUBÍ LOS DATOS DEL COMPROBANTE ]
        </h2>
        <p className="text-sm text-muted-foreground">
          Después de yapear, abrí "Movimientos" en tu app Yape, abrí esta
          transferencia y copiá los datos. También adjuntá la captura.
        </p>
        <YapeUploadForm
          orderId={order.id}
          brandId={order.brand.slug}
          expectedAmountCents={order.total_cents}
          buyerName={order.buyer_name}
          appUrl={publicEnv.NEXT_PUBLIC_APP_URL}
        />
      </section>

      {order.brand.whatsapp_e164 && (
        <p className="text-center text-xs text-muted-foreground">
          ¿Algún problema?{' '}
          <a
            href={`https://wa.me/${order.brand.whatsapp_e164.replace(/[^\d]/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-secondary underline-offset-4 hover:underline"
          >
            WhatsApp soporte
          </a>
        </p>
      )}
    </main>
  );
}
