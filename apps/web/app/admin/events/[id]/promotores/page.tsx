import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';
import { PromoCodeManager, type PromoCodeRow, type PromoSales } from '../PromoCodeManager';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// Promotores (RR.PP.) — UN solo lugar: crear/gestionar códigos + ranking.
// =============================================================
// Antes los códigos se CREABAN en un acordeón del Resumen y se MEDÍAN acá (el
// propio empty state decía "cargalos en la pestaña Resumen"). Ver handoff.
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
  // Columnas completas: las usa también el gestor de códigos (crear/revocar/enviar).
  const [{ data: codes }, { data: types }] = await Promise.all([
    admin
      .from('promo_codes')
      .select('id, code, label, discount_type, discount_value, max_uses, use_count, per_email_limit, applies_to_all, expires_at, is_active, created_at')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false }),
    admin.from('ticket_types').select('id, name').eq('event_id', event.id).order('sort_order'),
  ]);

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

  // Ventas por código para el gestor (mismo agregado que el ranking).
  const sales: PromoSales = {};
  for (const r of rows) sales[r.codeId] = { entries: r.entradas, soldCents: r.recaudadoCents, discountCents: r.descuentoCents };

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <span className="eyebrow">Ventas y pagos</span>
        <h2 className="s-h2" style={{ marginTop: 6 }}>Promotores</h2>
        <p className="s-card__desc">Crea códigos para tus RR.PP. y mira cuánto vendió cada uno.</p>
      </div>

      {/* 1) Crear y gestionar códigos */}
      <PromoCodeManager
        eventId={event.id}
        ticketTypes={(types ?? []).map((t) => ({ id: t.id, name: t.name }))}
        codes={(codes ?? []) as PromoCodeRow[]}
        sales={sales}
        impersonating={ctx.soloLectura}
      />

      {/* 2) Ranking */}
      <div className="s-section">
        <h3 className="s-h3" style={{ marginBottom: 4 }}>Ranking</h3>
        <p className="s-card__desc" style={{ marginBottom: 12 }}>
          {rows.length} código{rows.length === 1 ? '' : 's'} · {totalClicks} clic{totalClicks === 1 ? '' : 's'} · {totalEntradas} entrada{totalEntradas === 1 ? '' : 's'} colocadas · {formatPEN(totalRecaudado)} recaudado
        </p>
        {rows.length === 0 ? (
          <div className="s-card"><p className="s-empty">Todavía no hay códigos. Crea el primero arriba y comparte el link de tu promotor.</p></div>
        ) : (
          <div className="s-card s-card--flush">
            <ol className="a-rank">
              {rows.map((r, i) => (
                <li key={r.codeId} className="a-rank__row">
                  <span className={`a-rank__pos${i < 3 && r.recaudadoCents > 0 ? ' a-rank__pos--top' : ''}`}>#{i + 1}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="a-rank__name">{r.label || r.code}</p>
                    <p className="s-muted s-small">
                      Código <strong>{r.code}</strong>
                      {' · '}{r.clicks} clic{r.clicks === 1 ? '' : 's'}
                      {r.clicks > 0 && <> · {Math.round((r.entradas / r.clicks) * 100)}% conversión</>}
                      {r.descuentoCents > 0 && <> · {formatPEN(r.descuentoCents)} en descuentos</>}
                    </p>
                  </div>
                  <div className="a-rank__num">
                    <p className="a-rank__money">{formatPEN(r.recaudadoCents)}</p>
                    <p className="s-muted s-small">{r.entradas} entrada{r.entradas === 1 ? '' : 's'}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </>
  );
}
