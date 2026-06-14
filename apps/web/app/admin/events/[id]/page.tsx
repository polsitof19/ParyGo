import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bell, Tag } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';
import { YapeReviewRow } from '@/app/admin/yape/YapeReviewRow';
import { PromoCodeManager, type PromoCodeRow, type PromoSales } from './PromoCodeManager';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function AdminEventResumenPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();
  const impersonating = ctx.impersonating;

  const admin = createAdminClient();
  const { data: event } = await admin.from('events').select('id, brand_id').eq('id', params.id).maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  type ProofRow = {
    id: string; amount_cents: number; operation_number: string; payer_name: string;
    security_code: string; receipt_url: string; created_at: string;
    order: { id: string; buyer_name: string; buyer_email: string; buyer_phone: string; total_cents: number; event_id: string; event: { name: string } | null } | null;
  };

  // ---- OLA 1: queries independientes en paralelo ----
  const [
    { data: paid },
    { data: ticketTypes },
    { data: scanned },
    { data: pendData },
    { data: activePrices },
    { data: rejected },
    { data: promoCodes },
    { data: promoOrders },
  ] = await Promise.all([
    admin.from('orders').select('id, total_cents, payment_method, created_at').eq('event_id', event.id).eq('status', 'paid'),
    admin.from('ticket_types').select('id, name, price_cents, capacity, sold, is_unlimited, is_active, sort_order').eq('event_id', event.id).order('sort_order'),
    admin.from('tickets').select('ticket_type_id').eq('event_id', event.id).is('invalidated_at', null).not('validated_at', 'is', null),
    admin
      .from('yape_proofs')
      .select(`id, amount_cents, operation_number, payer_name, security_code, receipt_url, created_at,
        order:orders!yape_proofs_order_id_fkey ( id, buyer_name, buyer_email, buyer_phone, total_cents, event_id, event:events ( name ) )`)
      .eq('brand_id', event.brand_id)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: true }),
    admin.rpc('get_event_active_prices', { p_event_id: event.id }),
    admin
      .from('yape_proofs')
      .select('id, amount_cents, reject_reason, reviewed_at, order:orders!yape_proofs_order_id_fkey ( buyer_name, buyer_email, event_id )')
      .eq('brand_id', event.brand_id).eq('status', 'rejected').order('reviewed_at', { ascending: false }).limit(50),
    admin.from('promo_codes').select('id, code, label, discount_type, discount_value, max_uses, use_count, per_email_limit, applies_to_all, expires_at, is_active, created_at').eq('event_id', event.id).order('created_at', { ascending: false }),
    admin.from('orders').select('id, promo_code_id, total_cents, discount_cents').eq('event_id', event.id).eq('status', 'paid').not('promo_code_id', 'is', null),
  ]);

  const paidRows = (paid ?? []) as { id: string; total_cents: number | null; payment_method: string; created_at: string }[];
  const paidCents = paidRows.reduce((a, o) => a + (o.total_cents ?? 0), 0);
  const types = ticketTypes ?? [];

  // ---- Métricas ----
  // Cortesías (payment_method='courtesy', S/0) van a su PROPIO bucket — no se
  // cuentan como Yape (no inflan el conteo de órdenes pagadas ni el dinero).
  const byMethod = { yape: { count: 0, cents: 0 }, mp: { count: 0, cents: 0 }, courtesy: { count: 0, cents: 0 } };
  for (const o of paidRows) {
    const b = o.payment_method === 'mercadopago' ? byMethod.mp
      : o.payment_method === 'courtesy' ? byMethod.courtesy
        : byMethod.yape;
    b.count += 1; b.cents += o.total_cents ?? 0;
  }
  const dayMap = new Map<string, number>();
  for (const o of paidRows) {
    const day = new Date(o.created_at).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short' });
    dayMap.set(day, (dayMap.get(day) ?? 0) + (o.total_cents ?? 0));
  }
  const byDay = [...dayMap.entries()].slice(-14);
  const maxDay = Math.max(1, ...byDay.map(([, v]) => v));

  const totalSold = types.reduce((a, t) => a + (t.sold ?? 0), 0);
  const capped = types.filter((t) => !t.is_unlimited);
  const soldCapped = capped.reduce((a, t) => a + (t.sold ?? 0), 0);
  const capTotal = capped.reduce((a, t) => a + (t.capacity ?? 0), 0);
  const hasUnlimited = types.some((t) => t.is_unlimited);

  // Escaneados (entraron por puerta) por tipo + total — tickets ya validados.
  const scannedByType = new Map<string, number>();
  let totalScanned = 0;
  for (const t of (scanned ?? []) as { ticket_type_id: string }[]) { scannedByType.set(t.ticket_type_id, (scannedByType.get(t.ticket_type_id) ?? 0) + 1); totalScanned++; }

  // Yape PENDIENTE de aprobar (NO suma al confirmado hasta aprobarse).
  const pendingProofs = ((pendData as unknown as ProofRow[] | null) ?? []).filter((p) => p.order?.event_id === event.id);
  const pendingCount = pendingProofs.length;
  const pendingCents = pendingProofs.reduce((a, p) => a + (p.order?.total_cents ?? 0), 0);

  // Próxima fase de precio por tipo (para alertas).
  const nextByType = new Map<string, { cents: number; at: string }>();
  for (const ap of (activePrices ?? []) as { ticket_type_id: string; next_price_cents: number | null; next_starts_at: string | null }[]) {
    if (ap.next_price_cents != null && ap.next_starts_at) nextByType.set(ap.ticket_type_id, { cents: ap.next_price_cents, at: ap.next_starts_at });
  }

  const promoOrderRows = (promoOrders ?? []) as { id: string; promo_code_id: string | null; total_cents: number | null; discount_cents: number | null }[];

  // ---- OLA 2: queries que dependen de la ola 1, en paralelo ----
  const paidIds = paidRows.map((o) => o.id);
  const pendOrderIds = pendingProofs.map((p) => p.order?.id).filter((x): x is string => !!x);
  const [recItems, phaseRows, pendItems, promoTickets, pendingReview] = await Promise.all([
    paidIds.length > 0
      ? admin.from('order_items').select('ticket_type_id, subtotal_cents').in('order_id', paidIds).then((r) => r.data)
      : Promise.resolve(null),
    types.length > 0
      ? admin
          .from('ticket_type_price_phases')
          .select('ticket_type_id, name, starts_at, ends_at, sort_order')
          .in('ticket_type_id', types.map((t) => t.id))
          .order('sort_order')
          .then((r) => r.data)
      : Promise.resolve(null),
    pendOrderIds.length > 0
      ? admin.from('order_items').select('order_id, ticket_type_name, quantity').in('order_id', pendOrderIds).then((r) => r.data)
      : Promise.resolve(null),
    promoOrderRows.length > 0
      ? admin.from('tickets').select('order_id').eq('event_id', event.id).is('invalidated_at', null).in('order_id', promoOrderRows.map((o) => o.id)).then((r) => r.data)
      : Promise.resolve(null),
    Promise.all(
      pendingProofs.map(async (p) => {
        const { data: signed } = await admin.storage.from('yape-proofs').createSignedUrl(p.receipt_url, 60 * 10);
        return { ...p, signedReceiptUrl: signed?.signedUrl ?? null, items: [] as { name: string; quantity: number }[] };
      })
    ),
  ]);

  // Recaudación por tipo (order_items de pagadas).
  const recByType = new Map<string, number>();
  for (const it of (recItems ?? []) as { ticket_type_id: string; subtotal_cents: number | null }[]) {
    recByType.set(it.ticket_type_id, (recByType.get(it.ticket_type_id) ?? 0) + (it.subtotal_cents ?? 0));
  }

  // Fase activa por tipo (la ventana que contiene ahora).
  const phaseByType = new Map<string, string>();
  {
    const nowIso = new Date().toISOString();
    for (const ph of (phaseRows ?? []) as { ticket_type_id: string; name: string | null; starts_at: string | null; ends_at: string | null }[]) {
      if (phaseByType.has(ph.ticket_type_id)) continue; // ya tomamos la primera activa (menor sort_order)
      const startsOk = !ph.starts_at || ph.starts_at <= nowIso;
      const endsOk = !ph.ends_at || ph.ends_at > nowIso;
      if (startsOk && endsOk && ph.name) phaseByType.set(ph.ticket_type_id, ph.name);
    }
  }

  // Items por orden de cada proof pendiente (qué entradas se aprueban).
  const pendItemsByOrder = new Map<string, { name: string; quantity: number }[]>();
  for (const it of (pendItems ?? []) as { order_id: string; ticket_type_name: string | null; quantity: number | null }[]) {
    const arr = pendItemsByOrder.get(it.order_id) ?? [];
    arr.push({ name: it.ticket_type_name ?? 'Entrada', quantity: it.quantity ?? 0 });
    pendItemsByOrder.set(it.order_id, arr);
  }
  // Inyectar los items resueltos en cada proof pendiente (las URLs firmadas se
  // resolvieron en paralelo; los items dependían de pendItemsByOrder).
  for (const p of pendingReview) p.items = pendItemsByOrder.get(p.order?.id ?? '') ?? [];
  // Alertas visuales (stock bajo / agotado / sube de precio pronto).
  const alerts: { tone: 'deny' | 'warn' | 'info'; text: string }[] = [];
  for (const t of types) {
    if (!t.is_unlimited && t.capacity > 0) {
      const libres = Math.max(0, t.capacity - (t.sold ?? 0));
      if (libres === 0) alerts.push({ tone: 'deny', text: `${t.name} agotado` });
      else if (libres <= 10) alerts.push({ tone: 'warn', text: `Te quedan ${libres} ${t.name}` });
    }
    const nx = nextByType.get(t.id);
    if (nx) {
      const hrs = (new Date(nx.at).getTime() - Date.now()) / 3600000;
      if (hrs > 0 && hrs <= 72) alerts.push({ tone: 'info', text: `${t.name} sube a ${formatPEN(nx.cents)} el ${new Date(nx.at).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}` });
    }
  }
  const confirmedCents = byMethod.yape.cents + byMethod.mp.cents;
  const recTotal = [...recByType.values()].reduce((a, b) => a + b, 0);

  // Yapes rechazados (lectura).
  const rejectedRows = ((rejected ?? []) as unknown as { id: string; amount_cents: number; reject_reason: string | null; reviewed_at: string | null; order: { buyer_name: string; buyer_email: string; event_id: string } | null }[])
    .filter((r) => r.order?.event_id === event.id);

  // Promos.
  const ticketsPerOrder = new Map<string, number>();
  for (const t of (promoTickets ?? []) as { order_id: string }[]) ticketsPerOrder.set(t.order_id, (ticketsPerOrder.get(t.order_id) ?? 0) + 1);
  const promoSales: PromoSales = {};
  for (const o of promoOrderRows) {
    if (!o.promo_code_id) continue;
    const agg = promoSales[o.promo_code_id] ?? { entries: 0, soldCents: 0, discountCents: 0 };
    agg.entries += ticketsPerOrder.get(o.id) ?? 0; agg.soldCents += o.total_cents ?? 0; agg.discountCents += o.discount_cents ?? 0;
    promoSales[o.promo_code_id] = agg;
  }

  return (
    <>
      {/* Aprobar Yape — lo primero accionable, arriba de todo. La aprobación REAL
          (no un banner): cada comprobante con sus botones Aprobar/Rechazar inline. */}
      {pendingCount > 0 && (
        <section className="a-yape-inline" aria-labelledby="yape-inline-title">
          <div className="a-yape-inline__head">
            <h2 id="yape-inline-title" className="s-h2" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Bell className="h-5 w-5" style={{ color: 'var(--tangerine)' }} />
              Yapes para aprobar <span className="s-badge s-badge--alert">{pendingCount}</span>
            </h2>
            <p className="s-card__desc" style={{ margin: '4px 0 0' }}>
              {formatPEN(pendingCents)} esperando tu aprobación · hay gente esperando su QR.
            </p>
          </div>
          <div className="s-stack" style={{ gap: 14 }}>
            {pendingReview.map((p) => (
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
                  items={p.items}
                  impersonating={impersonating}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Alertas visuales */}
      {alerts.length > 0 && (
        <div className="a-alerts">
          {alerts.map((al, i) => <span key={i} className={`a-alert a-alert--${al.tone}`}>{al.text}</span>)}
        </div>
      )}

      {/* Cuadre de dinero — "este es tu dinero" */}
      <section style={{ marginTop: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Tu dinero</h2>
        <div className="s-card">
          <p className="s-card__desc" style={{ marginBottom: 14 }}>Esto debería estar en tu cuenta de <strong>Yape / MercadoPago</strong>. ParyGo no toca tu plata: cada cobro va directo a tu cuenta.</p>
          <div className="a-money">
            <div className="a-money__cell"><span className="s-stat__label">Yape aprobado</span><span className="a-money__v">{formatPEN(byMethod.yape.cents)}</span><span className="s-stat__sub">{byMethod.yape.count} órdenes</span></div>
            <div className="a-money__cell"><span className="s-stat__label">MercadoPago</span><span className="a-money__v">{formatPEN(byMethod.mp.cents)}</span><span className="s-stat__sub">{byMethod.mp.count} órdenes</span></div>
            {byMethod.courtesy.count > 0 && (
              <div className="a-money__cell"><span className="s-stat__label">Cortesías</span><span className="a-money__v">{byMethod.courtesy.count}</span><span className="s-stat__sub">entregadas gratis</span></div>
            )}
            <div className="a-money__cell a-money__cell--total"><span className="s-stat__label">Total confirmado</span><span className="a-money__v">{formatPEN(confirmedCents)}</span><span className="s-stat__sub">ya en tus cuentas</span></div>
          </div>
          {pendingCount > 0 && (
            <div className="a-money__pending">
              <span>⏳ <strong>Yape pendiente de aprobar: {formatPEN(pendingCents)}</strong> ({pendingCount}). No cuenta como confirmado hasta que lo apruebes — cuadralo con tu app de Yape.</span>
              <Link href={`/admin/events/${event.id}/yape`} className="s-btn s-btn--soft s-btn--sm">Revisar Yape</Link>
            </div>
          )}
        </div>
      </section>

      {/* Tabla por tipo de entrada */}
      <section style={{ marginTop: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Entradas por tipo</h2>
        {types.length === 0 ? (
          <div className="s-card"><p className="s-empty">Este evento no tiene tipos de entrada todavía.</p></div>
        ) : (
          <div className="s-card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="s-table a-typetable">
              <thead><tr><th>Tipo</th><th className="num">Capacidad</th><th className="num">Vendidas</th><th className="num">Libres</th><th className="num">Escaneados</th><th className="num">Recaudado</th></tr></thead>
              <tbody>
                {types.map((t) => {
                  const sold = t.sold ?? 0;
                  const libres = t.is_unlimited ? null : Math.max(0, t.capacity - sold);
                  const scanned = scannedByType.get(t.id) ?? 0;
                  const rec = recByType.get(t.id) ?? 0;
                  const phase = phaseByType.get(t.id);
                  return (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.name}</strong>{!t.is_active && <span className="s-badge s-badge--draft" style={{ marginLeft: 6 }}>inactivo</span>}
                        {phase && <div style={{ fontSize: 12, color: 'var(--tangerine)', fontWeight: 600 }}>{phase}</div>}
                      </td>
                      <td className="num">{t.is_unlimited ? '∞' : t.capacity}</td>
                      <td className="num">{sold}</td>
                      <td className="num">{t.is_unlimited ? '—' : libres}</td>
                      <td className="num">{scanned}</td>
                      <td className="num">{formatPEN(rec)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Total</strong></td>
                  <td className="num">{capTotal > 0 ? capTotal : (hasUnlimited ? '∞' : '—')}</td>
                  <td className="num">{totalSold}</td>
                  <td className="num">{capTotal > 0 ? Math.max(0, capTotal - soldCapped) : '—'}</td>
                  <td className="num">{totalScanned}</td>
                  <td className="num">{formatPEN(recTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Ventas por día */}
      {paidRows.length > 0 && byDay.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 className="s-h2" style={{ marginBottom: 12 }}>Ventas por día</h2>
          <div className="s-card">
            <div className="s-stack" style={{ gap: 6 }}>
              {byDay.map(([day, cents]) => (
                <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="s-muted" style={{ fontSize: 12.5, width: 64, flexShrink: 0 }}>{day}</span>
                  <div className="a-bar" style={{ flex: 1 }}><div className="a-bar__fill" style={{ width: `${Math.round((cents / maxDay) * 100)}%` }} /></div>
                  <span style={{ fontSize: 12.5, width: 72, textAlign: 'right', flexShrink: 0 }}>{formatPEN(cents)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Yapes rechazados */}
      {rejectedRows.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 className="s-h2" style={{ marginBottom: 12 }}>Yapes rechazados <span className="s-badge s-badge--draft" style={{ marginLeft: 8 }}>{rejectedRows.length}</span></h2>
          <div className="s-card" style={{ padding: 0 }}>
            <ul className="s-stack" style={{ gap: 0, listStyle: 'none', margin: 0, padding: 0 }}>
              {rejectedRows.map((r) => (
                <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '12px 16px', borderTop: '1px solid var(--cream-3)' }}>
                  <span style={{ minWidth: 0 }}><span style={{ fontWeight: 600 }}>{r.order?.buyer_name ?? '—'}</span><span className="s-muted" style={{ fontSize: 13 }}> · {r.order?.buyer_email}</span>{r.reject_reason && <div className="s-muted" style={{ fontSize: 12.5 }}>Motivo: {r.reject_reason}</div>}</span>
                  <span className="s-muted" style={{ fontSize: 12.5, textAlign: 'right', flexShrink: 0 }}>{formatPEN(r.amount_cents)}<br />{r.reviewed_at && new Date(r.reviewed_at).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Códigos promocionales — sección secundaria, colapsada por defecto. */}
      <details className="a-accordion" style={{ marginTop: 24 }}>
        <summary className="a-accordion__summary">
          <span className="a-accordion__title">
            <Tag className="h-4 w-4" /> Códigos de RR.PP.
            {(promoCodes?.length ?? 0) > 0 && <span className="s-badge s-badge--draft">{promoCodes!.length}</span>}
          </span>
          <span className="a-accordion__hint">Códigos de descuento y seguimiento de ventas por promotor</span>
        </summary>
        <div className="a-accordion__body">
          <PromoCodeManager eventId={event.id} ticketTypes={types.map((t) => ({ id: t.id, name: t.name }))} codes={(promoCodes ?? []) as PromoCodeRow[]} sales={promoSales} impersonating={impersonating} />
        </div>
      </details>
    </>
  );
}
