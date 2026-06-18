import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// A1 — Panel de promotores (RR.PP.) · SOLO LECTURA
// =============================================================
// Por cada código de promotor del evento: nombre (label), entradas colocadas,
// recaudado y ranking. Lee promo_codes + promo_redemptions (consumidas) — NO
// agrega tracking nuevo (lotes por promotor siguen diferidos). Scopeado a la
// marca del dueño: cero acceso cruzado entre marcas.

type Agg = { codeId: string; code: string; label: string | null; entradas: number; recaudadoCents: number; descuentoCents: number; clicks: number };

export default async function PromotersPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();

  const admin = createAdminClient();
  // TENANCY: el evento debe ser de la marca activa (sesión o impersonada).
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, name')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  // Todos los códigos del evento (así mostramos también los que aún no vendieron).
  const { data: codes } = await admin
    .from('promo_codes')
    .select('id, code, label')
    .eq('event_id', event.id);

  // Canjes CONSUMIDOS (= órdenes pagadas que usaron un código). Traemos el monto
  // de la orden (recaudado) y las cantidades de order_items (entradas colocadas).
  const { data: reds } = await admin
    .from('promo_redemptions')
    .select(`
      promo_code_id, amount_discount_cents,
      orders!inner ( total_cents, status, order_items ( quantity ) )
    `)
    .eq('event_id', event.id)
    .eq('status', 'consumed');

  // Clics del link de promotor (?ref) por código — agregado en Postgres.
  const { data: clickRows } = await admin.rpc('ref_click_counts', { p_event_id: event.id });
  const clicksByCode = new Map<string, number>();
  for (const r of (clickRows ?? []) as { promo_code_id: string; clicks: number }[]) {
    clicksByCode.set(r.promo_code_id, Number(r.clicks) || 0);
  }

  const byCode = new Map<string, Agg>();
  for (const c of codes ?? []) {
    byCode.set(c.id, { codeId: c.id, code: c.code, label: c.label, entradas: 0, recaudadoCents: 0, descuentoCents: 0, clicks: clicksByCode.get(c.id) ?? 0 });
  }
  type RedRow = {
    promo_code_id: string;
    amount_discount_cents: number | null;
    orders: { total_cents: number | null; status: string; order_items: { quantity: number | null }[] | null } | null;
  };
  for (const r of (reds ?? []) as unknown as RedRow[]) {
    // Defensa: solo contamos si la orden quedó efectivamente pagada.
    if (!r.orders || r.orders.status !== 'paid') continue;
    const agg = byCode.get(r.promo_code_id);
    if (!agg) continue;
    const entradas = (r.orders.order_items ?? []).reduce((s, it) => s + (it.quantity ?? 0), 0);
    agg.entradas += entradas;
    agg.recaudadoCents += r.orders.total_cents ?? 0;
    agg.descuentoCents += r.amount_discount_cents ?? 0;
  }

  // Ranking: por recaudado desc, luego entradas desc.
  const rows = [...byCode.values()].sort((a, b) => b.recaudadoCents - a.recaudadoCents || b.entradas - a.entradas);
  const totalEntradas = rows.reduce((s, r) => s + r.entradas, 0);
  const totalRecaudado = rows.reduce((s, r) => s + r.recaudadoCents, 0);
  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <span className="eyebrow">Promotores</span>
        <h2 className="s-h2" style={{ marginTop: 2 }}>Ventas por RR.PP.</h2>
        <p className="s-card__desc">
          {rows.length} código{rows.length === 1 ? '' : 's'} · {totalClicks} clic{totalClicks === 1 ? '' : 's'} · {totalEntradas} entrada{totalEntradas === 1 ? '' : 's'} colocadas · {formatPEN(totalRecaudado)} recaudado
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="s-card"><p className="s-empty">Todavía no creaste códigos de promotor para este evento. Cargalos en la pestaña Resumen del evento.</p></div>
      ) : (
        <div className="s-stack" style={{ gap: 10 }}>
          {rows.map((r, i) => (
            <div key={r.codeId} className="s-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ width: 30, textAlign: 'center', fontWeight: 800, fontFamily: 'var(--display)', color: i < 3 ? 'var(--brand-ink)' : 'var(--ink-3)' }}>
                #{i + 1}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontWeight: 700 }}>{r.label || r.code}</p>
                <p className="s-muted" style={{ fontSize: 13 }}>
                  Código <strong>{r.code}</strong>
                  {' · '}{r.clicks} clic{r.clicks === 1 ? '' : 's'}
                  {r.clicks > 0 && <> · {Math.round((r.entradas / r.clicks) * 100)}% conversión</>}
                  {r.descuentoCents > 0 && <> · {formatPEN(r.descuentoCents)} en descuentos</>}
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontWeight: 800, fontFamily: 'var(--display)' }}>{formatPEN(r.recaudadoCents)}</p>
                <p className="s-muted" style={{ fontSize: 13 }}>{r.entradas} entrada{r.entradas === 1 ? '' : 's'}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
