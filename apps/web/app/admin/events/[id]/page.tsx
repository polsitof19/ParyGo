import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';
import { PromoCodeManager, type PromoCodeRow, type PromoSales } from './PromoCodeManager';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function AdminEventResumenPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) notFound();

  const admin = createAdminClient();
  const { data: event } = await admin.from('events').select('id, brand_id').eq('id', params.id).maybeSingle();
  if (!event || event.brand_id !== membership.brandId) notFound();

  const [{ data: paid }, { count: ticketCount }, { data: ticketTypes }] = await Promise.all([
    admin.from('orders').select('id, total_cents, payment_method, created_at').eq('event_id', event.id).eq('status', 'paid'),
    admin.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', event.id).is('invalidated_at', null),
    admin.from('ticket_types').select('id, name, price_cents, capacity, sold, is_unlimited, is_active, sort_order').eq('event_id', event.id).order('sort_order'),
  ]);

  const paidRows = (paid ?? []) as { id: string; total_cents: number | null; payment_method: string; created_at: string }[];
  const paidCents = paidRows.reduce((a, o) => a + (o.total_cents ?? 0), 0);
  const types = ticketTypes ?? [];

  // ---- Métricas ----
  const byMethod = { yape: { count: 0, cents: 0 }, mp: { count: 0, cents: 0 } };
  for (const o of paidRows) {
    const b = o.payment_method === 'mercadopago' ? byMethod.mp : byMethod.yape;
    b.count += 1; b.cents += o.total_cents ?? 0;
  }
  const dayMap = new Map<string, number>();
  for (const o of paidRows) {
    const day = new Date(o.created_at).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short' });
    dayMap.set(day, (dayMap.get(day) ?? 0) + (o.total_cents ?? 0));
  }
  const byDay = [...dayMap.entries()].slice(-14);
  const maxDay = Math.max(1, ...byDay.map(([, v]) => v));

  // Recaudación por tipo (order_items de pagadas) + fase de precio activa por tipo.
  const recByType = new Map<string, number>();
  const paidIds = paidRows.map((o) => o.id);
  if (paidIds.length > 0) {
    const { data: items } = await admin.from('order_items').select('ticket_type_id, subtotal_cents').in('order_id', paidIds);
    for (const it of (items ?? []) as { ticket_type_id: string; subtotal_cents: number | null }[]) {
      recByType.set(it.ticket_type_id, (recByType.get(it.ticket_type_id) ?? 0) + (it.subtotal_cents ?? 0));
    }
  }
  // Fase activa por tipo (la ventana que contiene ahora).
  const phaseByType = new Map<string, string>();
  if (types.length > 0) {
    const nowIso = new Date().toISOString();
    const { data: phases } = await admin
      .from('ticket_type_price_phases')
      .select('ticket_type_id, name, starts_at, ends_at, sort_order')
      .in('ticket_type_id', types.map((t) => t.id))
      .order('sort_order');
    for (const ph of (phases ?? []) as { ticket_type_id: string; name: string | null; starts_at: string | null; ends_at: string | null }[]) {
      if (phaseByType.has(ph.ticket_type_id)) continue; // ya tomamos la primera activa (menor sort_order)
      const startsOk = !ph.starts_at || ph.starts_at <= nowIso;
      const endsOk = !ph.ends_at || ph.ends_at > nowIso;
      if (startsOk && endsOk && ph.name) phaseByType.set(ph.ticket_type_id, ph.name);
    }
  }

  const totalSold = types.reduce((a, t) => a + (t.sold ?? 0), 0);
  const capped = types.filter((t) => !t.is_unlimited);
  const soldCapped = capped.reduce((a, t) => a + (t.sold ?? 0), 0);
  const capTotal = capped.reduce((a, t) => a + (t.capacity ?? 0), 0);
  const hasUnlimited = types.some((t) => t.is_unlimited);

  // Yapes rechazados (lectura).
  const { data: rejected } = await admin
    .from('yape_proofs')
    .select('id, amount_cents, reject_reason, reviewed_at, order:orders!yape_proofs_order_id_fkey ( buyer_name, buyer_email, event_id )')
    .eq('brand_id', event.brand_id).eq('status', 'rejected').order('reviewed_at', { ascending: false }).limit(50);
  const rejectedRows = ((rejected ?? []) as unknown as { id: string; amount_cents: number; reject_reason: string | null; reviewed_at: string | null; order: { buyer_name: string; buyer_email: string; event_id: string } | null }[])
    .filter((r) => r.order?.event_id === event.id);

  // Promos.
  const [{ data: promoCodes }, { data: promoOrders }] = await Promise.all([
    admin.from('promo_codes').select('id, code, label, discount_type, discount_value, max_uses, use_count, per_email_limit, applies_to_all, expires_at, is_active, created_at').eq('event_id', event.id).order('created_at', { ascending: false }),
    admin.from('orders').select('id, promo_code_id, total_cents, discount_cents').eq('event_id', event.id).eq('status', 'paid').not('promo_code_id', 'is', null),
  ]);
  const promoOrderRows = (promoOrders ?? []) as { id: string; promo_code_id: string | null; total_cents: number | null; discount_cents: number | null }[];
  const ticketsPerOrder = new Map<string, number>();
  if (promoOrderRows.length > 0) {
    const { data: pt } = await admin.from('tickets').select('order_id').eq('event_id', event.id).is('invalidated_at', null).in('order_id', promoOrderRows.map((o) => o.id));
    for (const t of (pt ?? []) as { order_id: string }[]) ticketsPerOrder.set(t.order_id, (ticketsPerOrder.get(t.order_id) ?? 0) + 1);
  }
  const promoSales: PromoSales = {};
  for (const o of promoOrderRows) {
    if (!o.promo_code_id) continue;
    const agg = promoSales[o.promo_code_id] ?? { entries: 0, soldCents: 0, discountCents: 0 };
    agg.entries += ticketsPerOrder.get(o.id) ?? 0; agg.soldCents += o.total_cents ?? 0; agg.discountCents += o.discount_cents ?? 0;
    promoSales[o.promo_code_id] = agg;
  }

  return (
    <>
      {/* KPIs */}
      <div className="s-stats-4">
        <div className="s-stat"><span className="s-stat__label">Recaudación</span><span className="s-stat__value" style={{ fontSize: 26 }}>{formatPEN(paidCents)}</span><span className="s-stat__sub">{paidRows.length} orden{paidRows.length === 1 ? '' : 'es'} pagadas</span></div>
        <div className="s-stat"><span className="s-stat__label">Entradas vendidas</span><span className="s-stat__value">{totalSold}</span><span className="s-stat__sub">{ticketCount ?? 0} tickets válidos</span></div>
        <div className="s-stat"><span className="s-stat__label">Cupos</span><span className="s-stat__value">{capTotal > 0 ? `${soldCapped}/${capTotal}` : (hasUnlimited ? '∞' : '—')}</span><span className="s-stat__sub">{hasUnlimited ? 'hay stock ilimitado' : 'vendidos / capacidad'}</span></div>
        <div className="s-stat"><span className="s-stat__label">Yape</span><span className="s-stat__value">{formatPEN(byMethod.yape.cents)}</span><span className="s-stat__sub">{byMethod.mp.count > 0 ? `MP: ${formatPEN(byMethod.mp.cents)}` : 'todo Yape'}</span></div>
      </div>

      {/* Cómo va — por tipo y fase */}
      <section style={{ marginTop: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Cómo va la venta</h2>
        {types.length === 0 ? (
          <div className="s-card"><p className="s-empty">Este evento no tiene tipos de entrada todavía.</p></div>
        ) : (
          <div className="s-stack" style={{ gap: 10 }}>
            {types.map((t) => {
              const sold = t.sold ?? 0;
              const phase = phaseByType.get(t.id);
              const rec = recByType.get(t.id) ?? 0;
              const pct = !t.is_unlimited && t.capacity > 0 ? Math.min(100, Math.round((sold / t.capacity) * 100)) : 0;
              const full = !t.is_unlimited && t.capacity > 0 && sold >= t.capacity;
              return (
                <div key={t.id} className="s-card" style={{ padding: '16px 18px' }}>
                  <div className="s-card__head" style={{ marginBottom: t.is_unlimited ? 0 : 8 }}>
                    <div>
                      <span className="a-evrow__name" style={{ fontSize: 16 }}>
                        Van <strong>{sold}</strong> {sold === 1 ? 'entrada' : 'entradas'} {t.name}
                        {!t.is_active && <span className="s-badge s-badge--draft" style={{ marginLeft: 6 }}>inactivo</span>}
                      </span>
                      <div className="s-card__desc" style={{ marginTop: 2 }}>
                        {phase && <><span style={{ color: 'var(--tangerine)', fontWeight: 600 }}>{phase}</span> · </>}
                        {t.is_unlimited ? 'stock ilimitado' : `${sold}/${t.capacity} cupos`}
                        {rec > 0 && <> · recaudó <strong>{formatPEN(rec)}</strong></>}
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

      {/* Métricas: método + ritmo */}
      {paidRows.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 className="s-h2" style={{ marginBottom: 12 }}>Métricas</h2>
          <div className="s-grid-2">
            <div className="s-card">
              <p className="eyebrow" style={{ marginBottom: 10 }}>Por método de pago</p>
              <div className="s-stack" style={{ gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Yape <span className="s-muted">· {byMethod.yape.count}</span></span><strong>{formatPEN(byMethod.yape.cents)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>MercadoPago <span className="s-muted">· {byMethod.mp.count}</span></span><strong>{formatPEN(byMethod.mp.cents)}</strong></div>
              </div>
            </div>
            <div className="s-card">
              <p className="eyebrow" style={{ marginBottom: 10 }}>Ventas por día</p>
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
                  <span className="s-muted" style={{ fontSize: 12.5, textAlign: 'right', flexShrink: 0 }}>{formatPEN(r.amount_cents)}<br />{r.reviewed_at && new Date(r.reviewed_at).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Códigos promocionales */}
      <section style={{ marginTop: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Códigos promocionales</h2>
        <PromoCodeManager eventId={event.id} ticketTypes={types.map((t) => ({ id: t.id, name: t.name }))} codes={(promoCodes ?? []) as PromoCodeRow[]} sales={promoSales} />
      </section>
    </>
  );
}
