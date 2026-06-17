import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';
import { PrintReportButton } from './PrintReportButton';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// Reporte post-evento (organizador) · SOLO LECTURA
// =============================================================
// Consolida lo que ya existe: vendidas (entradas emitidas válidas), recaudado
// (orders pagadas), % asistencia (tickets.validated_at) y no-shows, más ventas
// por promotor (promo_redemptions). NO agrega dato nuevo. Scopeado a la marca
// del dueño: cero cross-tenant.

type TypeRow = { id: string; name: string; emitidas: number; escaneadas: number; recaudadoCents: number };
type PromoRow = { code: string; label: string | null; entradas: number; recaudadoCents: number };

export default async function ReportePage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();

  const admin = createAdminClient();
  // TENANCY: el evento debe ser de la marca activa (sesión o impersonada).
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, name, starts_at, ends_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  // Todo depende solo del event_id → en paralelo.
  const [ttRes, statsRes, ordRes, oiRes, promoRes, redRes] = await Promise.all([
    admin.from('ticket_types').select('id, name, sort_order').eq('event_id', event.id).order('sort_order'),
    admin.rpc('event_ticket_stats', { p_event_id: event.id }),
    admin.from('orders').select('total_cents, payment_method').eq('event_id', event.id).eq('status', 'paid'),
    admin.from('order_items').select('ticket_type_id, subtotal_cents, orders!inner(event_id, status)').eq('orders.event_id', event.id).eq('orders.status', 'paid'),
    admin.from('promo_codes').select('id, code, label').eq('event_id', event.id),
    admin.from('promo_redemptions').select(`promo_code_id, orders!inner(total_cents, status, event_id, order_items(quantity))`).eq('event_id', event.id).eq('status', 'consumed'),
  ]);

  const types = ttRes.data ?? [];
  const stats = (statsRes.data ?? []) as { ticket_type_id: string; emitidas: number; escaneadas: number }[];
  const paidOrders = (ordRes.data ?? []) as { total_cents: number | null; payment_method: string }[];
  const orderItems = (oiRes.data ?? []) as unknown as { ticket_type_id: string | null; subtotal_cents: number | null }[];

  // Recaudado por tipo (de order_items de órdenes pagadas).
  const recByType = new Map<string, number>();
  for (const oi of orderItems) {
    if (!oi.ticket_type_id) continue;
    recByType.set(oi.ticket_type_id, (recByType.get(oi.ticket_type_id) ?? 0) + (oi.subtotal_cents ?? 0));
  }

  // Emitidas (válidas) + escaneadas por tipo — agregado en Postgres
  // (event_ticket_stats) en vez de traer todos los tickets.
  const byType = new Map<string, TypeRow>();
  for (const t of types) byType.set(t.id, { id: t.id, name: t.name, emitidas: 0, escaneadas: 0, recaudadoCents: recByType.get(t.id) ?? 0 });
  for (const r of stats) {
    const row = byType.get(r.ticket_type_id);
    if (!row) continue;
    row.emitidas = Number(r.emitidas) || 0;
    row.escaneadas = Number(r.escaneadas) || 0;
  }
  const typeRows = [...byType.values()];

  const totalVendidas = typeRows.reduce((s, r) => s + r.emitidas, 0);
  const totalEscaneadas = typeRows.reduce((s, r) => s + r.escaneadas, 0);
  const totalRecaudado = paidOrders.reduce((s, o) => s + (o.total_cents ?? 0), 0);
  const noShows = Math.max(0, totalVendidas - totalEscaneadas);
  const asistenciaPct = totalVendidas > 0 ? Math.round((totalEscaneadas / totalVendidas) * 100) : 0;

  // Cuadre por método (de las órdenes pagadas).
  const byMethod = new Map<string, { n: number; cents: number }>();
  for (const o of paidOrders) {
    const k = o.payment_method;
    const cur = byMethod.get(k) ?? { n: 0, cents: 0 };
    cur.n += 1; cur.cents += o.total_cents ?? 0;
    byMethod.set(k, cur);
  }
  const methodLabel = (m: string) => (m === 'mercadopago' ? 'MercadoPago' : m === 'yape_manual' ? 'Yape' : m === 'courtesy' ? 'Cortesías' : m);

  // Ventas por promotor (reusa la lógica del panel de promotores).
  const promoCodes = (promoRes.data ?? []) as { id: string; code: string; label: string | null }[];
  const reds = (redRes.data ?? []) as unknown as { promo_code_id: string; orders: { total_cents: number | null; status: string; order_items: { quantity: number | null }[] | null } | null }[];
  const promoByCode = new Map<string, PromoRow>();
  for (const c of promoCodes) promoByCode.set(c.id, { code: c.code, label: c.label, entradas: 0, recaudadoCents: 0 });
  for (const r of reds) {
    if (!r.orders || r.orders.status !== 'paid') continue;
    const row = promoByCode.get(r.promo_code_id);
    if (!row) continue;
    row.entradas += (r.orders.order_items ?? []).reduce((s, it) => s + (it.quantity ?? 0), 0);
    row.recaudadoCents += r.orders.total_cents ?? 0;
  }
  const promoRows = [...promoByCode.values()].filter((r) => r.entradas > 0 || r.recaudadoCents > 0).sort((a, b) => b.recaudadoCents - a.recaudadoCents);

  const startMs = Date.parse(event.starts_at);
  const ended = event.ends_at ? Date.parse(event.ends_at) < Date.now() : (Number.isFinite(startMs) && startMs < Date.now());

  return (
    <>
      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <span className="eyebrow">Reporte · {event.name}</span>
          <h2 className="s-h2" style={{ marginTop: 2 }}>{ended ? 'Reporte post-evento' : 'Reporte (en curso)'}</h2>
          <p className="s-card__desc">
            {ended ? 'Resumen final del evento.' : 'El evento todavía no terminó — los números siguen actualizándose.'} Datos privados de tu marca.
          </p>
        </div>
        <PrintReportButton />
      </div>

      {/* KPIs */}
      <div className="s-form-grid" style={{ gap: 12, marginBottom: 14 }}>
        <Kpi label="Entradas vendidas" value={String(totalVendidas)} />
        <Kpi label="Recaudado" value={formatPEN(totalRecaudado)} />
        <Kpi label="Asistencia" value={`${asistenciaPct}%`} sub={`${totalEscaneadas} de ${totalVendidas} ingresaron`} />
        <Kpi label="No-shows" value={String(noShows)} sub="vendidas que no ingresaron" />
      </div>

      {/* Cuadre por método */}
      <div className="s-card" style={{ marginBottom: 14 }}>
        <p className="s-card__title">Recaudado por método</p>
        {byMethod.size === 0 ? <p className="s-empty">Sin ventas pagadas todavía.</p> : (
          <div className="s-stack" style={{ gap: 6, marginTop: 6 }}>
            {[...byMethod.entries()].map(([m, v]) => (
              <Line key={m} left={`${methodLabel(m)} · ${v.n} orden${v.n === 1 ? '' : 'es'}`} right={formatPEN(v.cents)} />
            ))}
          </div>
        )}
      </div>

      {/* Por tipo de entrada */}
      <div className="s-card" style={{ marginBottom: 14 }}>
        <p className="s-card__title">Por tipo de entrada</p>
        {typeRows.length === 0 ? <p className="s-empty">No hay tipos de entrada.</p> : (
          <div className="s-stack" style={{ gap: 8, marginTop: 8 }}>
            {typeRows.map((r) => (
              <div key={r.id} style={{ borderTop: '1px solid var(--cream-3)', paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <strong>{r.name}</strong>
                  <span>{formatPEN(r.recaudadoCents)}</span>
                </div>
                <p className="s-muted" style={{ fontSize: 13, marginTop: 2 }}>
                  {r.emitidas} vendidas · {r.escaneadas} ingresaron · {Math.max(0, r.emitidas - r.escaneadas)} no-shows
                  {r.emitidas > 0 && <> · {Math.round((r.escaneadas / r.emitidas) * 100)}% asistencia</>}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ventas por promotor */}
      <div className="s-card">
        <p className="s-card__title">Ventas por promotor (RR.PP.)</p>
        {promoRows.length === 0 ? <p className="s-empty">No hubo ventas con código de promotor.</p> : (
          <div className="s-stack" style={{ gap: 6, marginTop: 6 }}>
            {promoRows.map((r) => (
              <Line key={r.code} left={`${r.label || r.code} · ${r.entradas} entrada${r.entradas === 1 ? '' : 's'}`} right={formatPEN(r.recaudadoCents)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="s-card" style={{ padding: '14px 16px' }}>
      <p className="s-muted" style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</p>
      <p style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 26, marginTop: 4 }}>{value}</p>
      {sub && <p className="s-muted" style={{ fontSize: 12, marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

function Line({ left, right }: { left: string; right: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderTop: '1px solid var(--cream-3)', paddingTop: 6 }}>
      <span className="s-muted" style={{ fontSize: 13.5 }}>{left}</span>
      <strong style={{ fontSize: 14 }}>{right}</strong>
    </div>
  );
}
