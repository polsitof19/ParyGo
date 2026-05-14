import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN, formatEventDate, whatsappLink } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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

  // Use admin client so we can fetch the order regardless of session/cookies
  // (buyer just came back from MercadoPago, no session).
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

  // If MP says pending or status not yet paid, show a polling-ish "wait" view.
  const isPending =
    searchParams.pendiente === '1' ||
    (order.status !== 'paid' && order.payment_method === 'mercadopago');

  // For Yape manual flows, we land here only after admin approval (or wait).
  const isYapeReview =
    order.status === 'pending_yape_review' && order.payment_method === 'yape_manual';

  if (isPending) {
    return (
      <main className="container-narrow space-y-6 py-20 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ PROCESANDO PAGO ]
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight md:text-5xl">
          Estamos confirmando tu pago
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          Esto suele tardar menos de 1 minuto. Esta página se actualiza sola.
          Si pasan más de 5 minutos sin novedad, escríbenos por WhatsApp.
        </p>
        {brand?.whatsapp_e164 && (
          <a
            href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block font-mono text-xs uppercase tracking-[0.18em] text-secondary underline-offset-4 hover:underline"
          >
            WhatsApp soporte
          </a>
        )}
        <ConfirmationPoller />
      </main>
    );
  }

  if (isYapeReview) {
    return (
      <main className="container-narrow space-y-6 py-20 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ COMPROBANTE EN REVISIÓN ]
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight md:text-5xl">
          Tu Yape está siendo verificado
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          {brand?.name ?? 'El promotor'} está revisando tu comprobante. Te
          enviamos un email + WhatsApp apenas se apruebe. Suele tomar 5-15
          minutos en horario operativo.
        </p>
        {brand?.whatsapp_e164 && (
          <a
            href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block font-mono text-xs uppercase tracking-[0.18em] text-secondary underline-offset-4 hover:underline"
          >
            ¿Pasó algo? WhatsApp soporte
          </a>
        )}
      </main>
    );
  }

  // Paid + tickets issued
  const tickets = order.tickets ?? [];
  const firstTicket = tickets[0];
  const ticketUrl = firstTicket
    ? `/t/${firstTicket.qr_code}`
    : null;

  return (
    <main className="container-narrow space-y-8 py-12">
      <header className="space-y-3 text-center">
        <span
          className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full"
          style={{
            background: 'rgba(0,255,136,0.15)',
            color: 'hsl(var(--secondary))',
          }}
        >
          <Check className="h-6 w-6 text-green" />
        </span>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ COMPRA CONFIRMADA ]
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight md:text-5xl">
          Tu entrada está lista
        </h1>
        <p className="text-muted-foreground">
          {event?.name} · {event?.starts_at && formatEventDate(event.starts_at)}
        </p>
      </header>

      {ticketUrl && (
        <div className="space-y-4">
          <p className="text-center font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Tu link permanente (guárdalo en favoritos)
          </p>
          <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-full border border-border bg-card px-5 py-3">
            <span className="truncate font-mono text-sm">
              parygo.com/t/{firstTicket!.qr_code.slice(0, 8)}…
            </span>
            <Link href={ticketUrl}>
              <Button size="sm" variant="gradient">
                Ver mi entrada →
              </Button>
            </Link>
          </div>
        </div>
      )}

      <section className="space-y-3 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ RESUMEN ]
        </h2>
        <Row label="Comprador">{order.buyer_name}</Row>
        <Row label="Email">{order.buyer_email}</Row>
        <Row label="Total">{formatPEN(order.total_cents)}</Row>
        <Row label="Entradas">
          <ul className="space-y-1">
            {tickets.map((t) => (
              <li key={t.id} className="font-mono text-xs">
                {t.ticket_number} · {t.ticket_type_name}
              </li>
            ))}
          </ul>
        </Row>
      </section>

      <section className="flex flex-wrap items-center justify-center gap-3">
        {firstTicket && brand?.whatsapp_e164 && (
          <a
            href={whatsappLink(
              brand.whatsapp_e164.replace(/[^\d]/g, ''),
              `Hola, te paso mi entrada para ${event?.name}: https://${brand.slug}.parygo.com/t/${firstTicket.qr_code}`
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border px-6 text-sm font-medium transition-colors hover:bg-muted"
          >
            <span aria-hidden>📲</span>
            Enviarme a WhatsApp
          </a>
        )}
        {ticketUrl && (
          <Link href={ticketUrl}>
            <Button variant="outline">Ver mi QR →</Button>
          </Link>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground">
        También te enviamos el QR a {order.buyer_email}. Si no llega en 5 min,
        revisa spam o usa el link permanente.
      </p>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[140px_1fr] sm:gap-3 text-sm">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}
