import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bell, ArrowRight } from 'lucide-react';
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

  const [{ data: paid }, { data: ticketTypes }] = await Promise.all([
    admin.from('orders').select('id, total_cents, payment_method, created_at').eq('event_id', event.id).eq('status', 'paid'),
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

  // Escaneados (entraron por puerta) por tipo + total — tickets ya validados.
  const scannedByType = new Map<string, number>();
  let totalScanned = 0;
  {
    const { data: scanned } = await admin.from('tickets').select('ticket_type_id').eq('event_id', event.id).is('invalidated_at', null).not('validated_at', 'is', null);
    for (const t of (scanned ?? []) as { ticket_type_id: string }[]) { scannedByType.set(t.ticket_type_id, (scannedByType.get(t.ticket_type_id) ?? 0) + 1); totalScanned++; }
  }
  // Yape PENDIENTE de aprobar (NO suma al confirmado hasta aprobarse).
  let pendingCents = 0, pendingCount = 0;
  {
    const { data: pend } = await admin.from('yape_proofs').select('order:orders!yape_proofs_order_id_fkey ( total_cents, event_id )').eq('brand_id', event.brand_id).eq('status', 'pending_review');
    for (const p of (pend ?? []) as { order: { total_cents: number | null; event_id: string } | null }[]) {
      if (p.order?.event_id !== event.id) continue;
      pendingCents += p.order?.total_cents ?? 0; pendingCount++;
    }
  }
  // Próxima fase de precio por tipo (para alertas).
  const nextByType = new Map<string, { cents: number; at: string }>();
  {
    const { data: activePrices } = await admin.rpc('get_event_active_prices', { p_event_id: event.id });
    for (const ap of (activePrices ?? []) as { ticket_type_id: string; next_price_cents: number | null; next_starts_at: string | null }[]) {
      if (ap.next_price_cents != null && ap.next_starts_at) nextByType.set(ap.ticket_type_id, { cents: ap.next_price_cents, at: ap.next_starts_at });
    }
  }
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
      {/* Yape pendiente — lo más urgente, arriba de todo. Solo si hay pendientes. */}
      {pendingCount > 0 && (
        <Link href={`/admin/events/${event.id}/yape`} className="a-yapebanner">
          <span className="a-yapebanner__main">
            <Bell className="h-5 w-5 a-yapebanner__bell" />
            <span>
              <strong>Tenés {pendingCount} Yape{pendingCount === 1 ? '' : 's'} esperando revisión</strong>
              <span className="a-yapebanner__sub">{formatPEN(pendingCents)} · hay gente esperando su QR</span>
            </span>
          </span>
          <span className="a-yapebanner__cta">Revisar ahora <ArrowRight className="h-4 w-4" /></span>
        </Link>
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

      {/* Códigos promocionales */}
      <section style={{ marginTop: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Códigos promocionales</h2>
        <PromoCodeManager eventId={event.id} ticketTypes={types.map((t) => ({ id: t.id, name: t.name }))} codes={(promoCodes ?? []) as PromoCodeRow[]} sales={promoSales} />
      </section>
    </>
  );
}
