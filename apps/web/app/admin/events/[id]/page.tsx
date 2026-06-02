import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPEN } from '@/lib/utils';
import { publicEnv } from '@/lib/env';
import { YapeReviewRow } from '../../yape/YapeReviewRow';
import { PromoCodeManager, type PromoCodeRow, type PromoSales } from './PromoCodeManager';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function AdminEventDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) notFound();

  const supabase = createClient();
  const admin = createAdminClient();

  const { data: event } = await supabase
    .from('events')
    .select('id, brand_id, slug, name, starts_at, is_published, venue_name, description, min_age')
    .eq('id', params.id)
    .maybeSingle();

  // ENFORCEMENT: a brand_admin may only view events of THEIR brand.
  if (!event || event.brand_id !== membership.brandId) notFound();

  const { data: brand } = await supabase
    .from('brands')
    .select('slug')
    .eq('id', event.brand_id)
    .single();

  const [{ data: paid }, { count: ticketCount }, { data: ticketTypes }, proofsRes] =
    await Promise.all([
      supabase.from('orders').select('total_cents').eq('event_id', event.id).eq('status', 'paid'),
      supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .is('invalidated_at', null),
      supabase
        .from('ticket_types')
        .select('id, name, price_cents, capacity, sold, is_unlimited, is_active, sort_order')
        .eq('event_id', event.id)
        .order('sort_order'),
      supabase
        .from('yape_proofs')
        .select(
          `id, amount_cents, operation_number, payer_name, security_code, receipt_url, created_at,
           order:orders!yape_proofs_order_id_fkey ( id, buyer_name, buyer_email, buyer_phone, total_cents, event_id,
             event:events ( name ) )`
        )
        .eq('brand_id', event.brand_id)
        .eq('status', 'pending_review')
        .order('created_at', { ascending: true }),
    ]);

  const paidCents = (paid ?? []).reduce((acc, o) => acc + (o.total_cents ?? 0), 0);
  const paidOrders = paid?.length ?? 0;

  // ---- Promo codes + sales-by-code (tracking por RRPP) ----
  const [{ data: promoCodes }, { data: promoOrders }] = await Promise.all([
    admin
      .from('promo_codes')
      .select(
        'id, code, label, discount_type, discount_value, max_uses, use_count, per_email_limit, applies_to_all, expires_at, is_active, created_at'
      )
      .eq('event_id', event.id)
      .order('created_at', { ascending: false }),
    // Paid orders that used a promo code — basis for "entradas vendidas" and "S/ movidos".
    admin
      .from('orders')
      .select('id, promo_code_id, total_cents, discount_cents')
      .eq('event_id', event.id)
      .eq('status', 'paid')
      .not('promo_code_id', 'is', null),
  ]);

  const promoOrderRows = (promoOrders ?? []) as {
    id: string;
    promo_code_id: string | null;
    total_cents: number | null;
    discount_cents: number | null;
  }[];

  // Count issued (non-invalidated) tickets per promo order to get "entradas".
  const promoOrderIds = promoOrderRows.map((o) => o.id);
  const ticketsPerOrder = new Map<string, number>();
  if (promoOrderIds.length > 0) {
    const { data: promoTickets } = await admin
      .from('tickets')
      .select('order_id')
      .eq('event_id', event.id)
      .is('invalidated_at', null)
      .in('order_id', promoOrderIds);
    for (const t of (promoTickets ?? []) as { order_id: string }[]) {
      ticketsPerOrder.set(t.order_id, (ticketsPerOrder.get(t.order_id) ?? 0) + 1);
    }
  }

  const promoSales: PromoSales = {};
  for (const o of promoOrderRows) {
    if (!o.promo_code_id) continue;
    const agg = promoSales[o.promo_code_id] ?? { entries: 0, soldCents: 0, discountCents: 0 };
    agg.entries += ticketsPerOrder.get(o.id) ?? 0;
    agg.soldCents += o.total_cents ?? 0;
    agg.discountCents += o.discount_cents ?? 0;
    promoSales[o.promo_code_id] = agg;
  }

  const promoTicketTypes = (ticketTypes ?? []).map((t) => ({ id: t.id, name: t.name }));

  type ProofRow = {
    id: string;
    amount_cents: number;
    operation_number: string;
    payer_name: string;
    security_code: string;
    receipt_url: string;
    created_at: string;
    order: {
      id: string;
      buyer_name: string;
      buyer_email: string;
      buyer_phone: string;
      total_cents: number;
      event_id: string;
      event: { name: string } | null;
    } | null;
  };
  // Only this event's pending proofs.
  const proofs = ((proofsRes.data as unknown as ProofRow[] | null) ?? []).filter(
    (p) => p.order?.event_id === event.id
  );
  const withUrls = await Promise.all(
    proofs.map(async (p) => {
      const { data: signed } = await admin.storage
        .from('yape-proofs')
        .createSignedUrl(p.receipt_url, 60 * 10);
      return { ...p, signedReceiptUrl: signed?.signedUrl ?? null };
    })
  );

  const brandUrl = brand?.slug
    ? `https://${brand.slug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/${event.slug}`
    : null;

  return (
    <div className="space-y-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Volver a tus eventos
      </Link>

      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ EVENTO ]
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight">
          {event.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date(event.starts_at).toLocaleString('es-PE', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          ·{' '}
          <span className={event.is_published ? 'text-green' : 'text-yellow'}>
            {event.is_published ? 'Publicado' : 'Borrador'}
          </span>
          {brandUrl && event.is_published && (
            <>
              {' · '}
              <a
                href={brandUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-secondary underline-offset-4 hover:underline"
              >
                Ver página pública <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}
        </p>
      </header>

      {/* KPIs of THIS event */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ventas pagadas" value={formatPEN(paidCents)} />
        <Kpi label="Órdenes pagadas" value={String(paidOrders)} />
        <Kpi label="Yape pendientes" value={String(withUrls.length)} />
        <Kpi label="Tickets emitidos" value={String(ticketCount ?? 0)} />
      </section>

      {/* Ticket types (display) */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ TIPOS DE ENTRADA ]
        </h2>
        {!ticketTypes || ticketTypes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Este evento no tiene tipos de entrada todavía.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {ticketTypes.map((t) => (
              <li key={t.id}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-3 py-4">
                    <div>
                      <p className="font-display text-lg uppercase leading-none">
                        {t.name}{' '}
                        {!t.is_active && (
                          <span className="font-mono text-[10px] text-muted-foreground">(inactivo)</span>
                        )}
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {t.is_unlimited
                          ? 'Stock ilimitado'
                          : `${t.sold} / ${t.capacity} vendidas`}
                      </p>
                    </div>
                    <span className="font-mono text-sm tabular-nums">{formatPEN(t.price_cents)}</span>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Promo codes (tracking por RRPP) */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ CÓDIGOS PROMOCIONALES ]
        </h2>
        <PromoCodeManager
          eventId={event.id}
          ticketTypes={promoTicketTypes}
          codes={(promoCodes ?? []) as PromoCodeRow[]}
          sales={promoSales}
        />
      </section>

      {/* Yape review for THIS event */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ YAPE · POR REVISAR ]
        </h2>
        {withUrls.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No hay comprobantes pendientes de este evento.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {withUrls.map((p) => (
              <YapeReviewRow
                key={p.id}
                proofId={p.id}
                receiptUrl={p.signedReceiptUrl}
                amountCents={p.amount_cents}
                expectedAmountCents={p.order?.total_cents ?? 0}
                amountMatches={p.amount_cents === p.order?.total_cents}
                operationNumber={p.operation_number}
                payerName={p.payer_name}
                securityCode={p.security_code}
                buyerName={p.order?.buyer_name ?? ''}
                buyerEmail={p.order?.buyer_email ?? ''}
                buyerPhone={p.order?.buyer_phone ?? ''}
                eventName={p.order?.event?.name ?? ''}
                createdAt={p.created_at}
                total={formatPEN(p.order?.total_cents ?? 0)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono text-[10px] uppercase tracking-[0.18em]">
          {label}
        </CardDescription>
        <CardTitle className="font-display text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
