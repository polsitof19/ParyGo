import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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

  // Read-only: capacidad agregada (excluye tipos ilimitados) para el resumen.
  const capped = (ticketTypes ?? []).filter((t) => !t.is_unlimited);
  const soldCapped = capped.reduce((a, t) => a + (t.sold ?? 0), 0);
  const capTotal = capped.reduce((a, t) => a + (t.capacity ?? 0), 0);
  const hasUnlimited = (ticketTypes ?? []).some((t) => t.is_unlimited);

  return (
    <>
      <Link href="/admin" className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> Tus eventos
      </Link>

      <header className="s-pagehead">
        <div>
          <span className="eyebrow">
            Evento
            <span className={`s-badge ${event.is_published ? 's-badge--ok' : 's-badge--draft'}`} style={{ marginLeft: 10, verticalAlign: 'middle' }}>
              {event.is_published ? 'Publicado' : 'Borrador'}
            </span>
          </span>
          <h1 className="s-h1" style={{ marginTop: 6 }}>{event.name}</h1>
          <p className="s-card__desc">
            {new Date(event.starts_at).toLocaleString('es-PE', {
              weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
            })}
            {event.venue_name && <> · {event.venue_name}</>}
          </p>
          {brandUrl && event.is_published && (
            <a href={brandUrl} target="_blank" rel="noopener noreferrer" className="s-brandhead__url" style={{ marginTop: 6 }}>
              Ver página pública <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </header>

      {/* KPIs del evento */}
      <div className="s-stats-4">
        <div className="s-stat">
          <span className="s-stat__label">Ventas pagadas</span>
          <span className="s-stat__value" style={{ fontSize: 26 }}>{formatPEN(paidCents)}</span>
          <span className="s-stat__sub">{paidOrders} orden{paidOrders === 1 ? '' : 'es'}</span>
        </div>
        <div className={`s-stat${withUrls.length > 0 ? ' s-stat--alert' : ''}`}>
          <span className="s-stat__label">Yape pendientes</span>
          <span className="s-stat__value">{withUrls.length}</span>
          <span className="s-stat__sub">{withUrls.length > 0 ? 'por aprobar abajo' : 'todo al día'}</span>
        </div>
        <div className="s-stat">
          <span className="s-stat__label">Tickets emitidos</span>
          <span className="s-stat__value">{ticketCount ?? 0}</span>
          <span className="s-stat__sub">válidos (no anulados)</span>
        </div>
        <div className="s-stat">
          <span className="s-stat__label">Cupos vendidos</span>
          <span className="s-stat__value">{capTotal > 0 ? `${soldCapped}/${capTotal}` : (hasUnlimited ? '∞' : '—')}</span>
          <span className="s-stat__sub">{hasUnlimited ? 'hay stock ilimitado' : 'capacidad con cupo'}</span>
        </div>
      </div>

      {/* Yape por revisar — PRIMERO: es la acción de plata urgente */}
      <section style={{ marginTop: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>
          Yape por revisar
          {withUrls.length > 0 && <span className="s-badge s-badge--alert" style={{ marginLeft: 10 }}>{withUrls.length}</span>}
        </h2>
        {withUrls.length === 0 ? (
          <div className="s-card"><p className="s-empty">No hay comprobantes pendientes de este evento. 🎉</p></div>
        ) : (
          <div className="s-stack" style={{ gap: 14 }}>
            {withUrls.map((p) => (
              <div key={p.id} className="s-card">
                <YapeReviewRow
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
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Tipos de entrada con barra de progreso */}
      <section style={{ marginTop: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Tipos de entrada</h2>
        {!ticketTypes || ticketTypes.length === 0 ? (
          <div className="s-card"><p className="s-empty">Este evento no tiene tipos de entrada todavía.</p></div>
        ) : (
          <div className="s-stack" style={{ gap: 10 }}>
            {ticketTypes.map((t) => {
              const pct = !t.is_unlimited && t.capacity > 0 ? Math.min(100, Math.round((t.sold / t.capacity) * 100)) : 0;
              const full = !t.is_unlimited && t.capacity > 0 && t.sold >= t.capacity;
              return (
                <div key={t.id} className="s-card" style={{ padding: '16px 18px' }}>
                  <div className="s-card__head" style={{ marginBottom: t.is_unlimited ? 0 : 8 }}>
                    <div>
                      <span className="a-evrow__name" style={{ fontSize: 16 }}>
                        {t.name}{' '}
                        {!t.is_active && <span className="s-badge s-badge--draft" style={{ marginLeft: 4 }}>inactivo</span>}
                      </span>
                      <div className="s-card__desc" style={{ marginTop: 2 }}>
                        {t.is_unlimited ? 'Stock ilimitado' : `${t.sold} / ${t.capacity} vendidas`}
                      </div>
                    </div>
                    <span className="s-saldo-num" style={{ fontSize: 18 }}>{formatPEN(t.price_cents)}</span>
                  </div>
                  {!t.is_unlimited && t.capacity > 0 && (
                    <div className="a-bar"><div className={`a-bar__fill${full ? ' a-bar__fill--full' : ''}`} style={{ width: `${pct}%` }} /></div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Códigos promocionales (tracking por RRPP) */}
      <section style={{ marginTop: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Códigos promocionales</h2>
        <PromoCodeManager
          eventId={event.id}
          ticketTypes={promoTicketTypes}
          codes={(promoCodes ?? []) as PromoCodeRow[]}
          sales={promoSales}
        />
      </section>
    </>
  );
}
