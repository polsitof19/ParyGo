import Link from 'next/link';
import { ChevronDown, Printer } from 'lucide-react';
import { todas } from '@/lib/todas';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';
import { publicEnv } from '@/lib/env';


export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Estadísticas del evento: todo el detalle que antes llenaba el inicio del
// evento (cuatro números, por tipo, por día, rechazados). El inicio ("Cómo
// va") quedó con lo que se usa: pendiente, tres cifras y acciones.
export default async function AdminEventEstadisticasPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();
  const impersonating = ctx.soloLectura;

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, slug, starts_at, ends_at, is_published, brand:brands ( slug )')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  type ProofRow = {
    id: string; amount_cents: number; operation_number: string; payer_name: string;
    security_code: string; receipt_url: string; created_at: string;
    order: { id: string; buyer_name: string; buyer_email: string; buyer_phone: string; total_cents: number; event_id: string } | null;
  };

  // ---- OLA 1: queries independientes en paralelo ----
  const [
    { data: paid },
    { data: ticketTypes },
    { data: ticketStats },
    { data: pendData },
    { data: activePrices },
    { data: rejected },
    { data: ticketRows },
    { data: mpStatus },
  ] = await Promise.all([
    todas((a, b) => admin.from('orders').select('id, total_cents, payment_method, created_at').eq('event_id', event.id).eq('status', 'paid').order('id').range(a, b)).then((data) => ({ data })),
    admin.from('ticket_types').select('id, name, price_cents, capacity, sold, is_unlimited, is_active, sort_order').eq('event_id', event.id).order('sort_order'),
    admin.rpc('event_ticket_stats', { p_event_id: event.id }),
    admin
      .from('yape_proofs')
      .select(`id, amount_cents, operation_number, payer_name, security_code, receipt_url, created_at,
        order:orders!yape_proofs_order_id_fkey ( id, buyer_name, buyer_email, buyer_phone, total_cents, event_id )`)
      .eq('brand_id', event.brand_id)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: true }),
    admin.rpc('get_event_active_prices', { p_event_id: event.id }),
    admin
      .from('yape_proofs')
      .select('id, amount_cents, reject_reason, reviewed_at, order:orders!yape_proofs_order_id_fkey ( buyer_name, buyer_email, event_id )')
      .eq('brand_id', event.brand_id).eq('status', 'rejected').order('reviewed_at', { ascending: false }).limit(50),
    // Tickets válidos del evento: para separar entradas VENDIDAS de cortesías
    // (ticket_types.sold cuenta las dos cosas juntas).
    todas((a, b) => admin.from('tickets').select('order_id').eq('event_id', event.id).is('invalidated_at', null).order('id').range(a, b)).then((data) => ({ data })),
    // ¿La marca cobra con tarjeta? Si nunca configuró MercadoPago, la caja de MP
    // en "Tu dinero" es ruido: siempre S/ 0. Solo booleanos (no desencripta).
    admin.rpc('get_brand_mp_status', { p_brand_id: event.brand_id }),
  ]);

  const mpRow = Array.isArray(mpStatus) ? mpStatus[0] : null;
  const mpConfigured = Boolean(mpRow?.has_access_token && mpRow?.has_public_key);
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

  // Escaneados (entraron por puerta) por tipo + total — agregado en Postgres
  // (event_ticket_stats) en vez de traer todos los tickets.
  const scannedByType = new Map<string, number>();
  let totalScanned = 0;
  for (const r of (ticketStats ?? []) as { ticket_type_id: string; escaneadas: number }[]) {
    const n = Number(r.escaneadas) || 0;
    scannedByType.set(r.ticket_type_id, n);
    totalScanned += n;
  }

  // Yape PENDIENTE de aprobar (NO suma al confirmado hasta aprobarse).
  const pendingProofs = ((pendData as unknown as ProofRow[] | null) ?? []).filter((p) => p.order?.event_id === event.id);
  const pendingCount = pendingProofs.length;
  const pendingCents = pendingProofs.reduce((a, p) => a + (p.order?.total_cents ?? 0), 0);

  // Próxima fase de precio por tipo (para alertas).
  const nextByType = new Map<string, { cents: number; at: string }>();
  for (const ap of (activePrices ?? []) as { ticket_type_id: string; next_price_cents: number | null; next_starts_at: string | null }[]) {
    if (ap.next_price_cents != null && ap.next_starts_at) nextByType.set(ap.ticket_type_id, { cents: ap.next_price_cents, at: ap.next_starts_at });
  }


  // ---- OLA 2: queries que dependen de la ola 1, en paralelo ----
  const paidIds = paidRows.map((o) => o.id);
  const pendOrderIds = pendingProofs.map((p) => p.order?.id).filter((x): x is string => !!x);
  const [recItems, phaseRows, pendItems, pendingReview] = await Promise.all([
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
    Promise.resolve([] as { items: { name: string; quantity: number }[]; order: ProofRow['order'] }[]),
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
      // El nombre lo pone el organizador ("Precio base", "Preventa 1"). Se muestra
      // como "Precio actual: X", así que se le saca el "Precio " de adelante para
      // no leer "Precio actual: Precio base".
      if (!startsOk || !endsOk || !ph.name) continue;
      const label = ph.name.replace(/^precio\s+/i, '').trim();
      phaseByType.set(ph.ticket_type_id, label || ph.name.trim());
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
  // MercadoPago solo se muestra si la marca lo tiene configurado (o si ya cobró
  // algo por ahí en este evento — histórico que no se puede ocultar).
  const showMp = mpConfigured || byMethod.mp.count > 0;
  const recTotal = [...recByType.values()].reduce((a, b) => a + b, 0);

  // Yapes rechazados (lectura).
  const rejectedRows = ((rejected ?? []) as unknown as { id: string; amount_cents: number; reject_reason: string | null; reviewed_at: string | null; order: { buyer_name: string; buyer_email: string; event_id: string } | null }[])
    .filter((r) => r.order?.event_id === event.id);

  // ---- "¿Cómo va?" — la franja de arriba ----
  // Vendidas = entradas de órdenes pagadas que NO son cortesía; las cortesías
  // se cuentan aparte (antes "Cortesías" mostraba la cantidad de ÓRDENES, no de
  // entradas: 1 envío de 10 cortesías se veía como "1").
  const courtesyOrderIds = new Set(paidRows.filter((o) => o.payment_method === 'courtesy').map((o) => o.id));
  const paidOrderIds = new Set(paidRows.map((o) => o.id));
  let soldTickets = 0;
  let courtesyTickets = 0;
  for (const t of (ticketRows ?? []) as { order_id: string }[]) {
    if (!paidOrderIds.has(t.order_id)) continue;
    if (courtesyOrderIds.has(t.order_id)) courtesyTickets += 1;
    else soldTickets += 1;
  }
  const soldPct = capTotal > 0 ? Math.min(100, Math.round((soldCapped / capTotal) * 100)) : null;
  const startsMs = Date.parse(event.starts_at);
  const endsMs = event.ends_at ? Date.parse(event.ends_at) : startsMs + 18 * 3600 * 1000;
  const days = Math.ceil((startsMs - Date.now()) / 86400000);
  const when = Date.now() > endsMs ? 'Terminó'
    : Date.now() >= startsMs ? 'Es hoy — en curso'
    : days <= 0 ? 'Hoy'
    : days === 1 ? 'Mañana'
    : `En ${days} días`;
  const whenSub = new Date(event.starts_at).toLocaleString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });
  const brandSlug = (Array.isArray(event.brand) ? event.brand[0] : event.brand)?.slug ?? null;
  const publicUrl = brandSlug ? `https://${brandSlug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/${event.slug}` : null;
  const noSalesYet = event.is_published && soldTickets === 0 && Date.now() < endsMs;

  return (
    <>
      {/* ORDEN (2026-09-22): lo pendiente arriba, la información abajo, lo raro
          plegado. Antes la cola de Yapes quedaba debajo de los cuatro números,
          las acciones y las alertas: en 390 caía a ~900px del borde. */}

      <h1 className="s-h1" style={{ marginBottom: 'var(--s-s3)' }}>Estadísticas</h1>

      {/* 2) ¿Cómo va? — cuatro números. La plata primero: es lo que se pregunta. */}
      <div className="a-pulse">
        <div className="s-stat">
          <span className="s-stat__label">Recaudado</span>
          <span className="s-stat__value">{formatPEN(confirmedCents)}</span>
          <span className="s-stat__sub">
            {pendingCount > 0
              ? `+ ${formatPEN(pendingCents)} por aprobar`
              : showMp
                ? `Yape ${formatPEN(byMethod.yape.cents)} · tarjeta ${formatPEN(byMethod.mp.cents)}`
                : 'confirmado en tu Yape'}
          </span>
        </div>
        <div className="s-stat">
          <span className="s-stat__label">Vendidas</span>
          <span className="s-stat__value">{soldTickets}</span>
          <span className="s-stat__sub">
            {soldPct !== null ? `${soldPct}% del aforo ocupado` : 'aforo ilimitado'}
            {courtesyTickets > 0 && ` · +${courtesyTickets} cortesía${courtesyTickets === 1 ? '' : 's'}`}
          </span>
          {soldPct !== null && <div className="a-meter" aria-hidden="true"><div className="a-meter__fill" style={{ width: `${soldPct}%` }} /></div>}
        </div>
        <div className="s-stat">
          <span className="s-stat__label">Cuándo</span>
          <span className="s-stat__value s-stat__value--text">{when}</span>
          <span className="s-stat__sub">{whenSub}</span>
        </div>
        <div className="s-stat">
          <span className="s-stat__label">Entraron</span>
          <span className="s-stat__value">{totalScanned}</span>
          <span className="s-stat__sub">escaneados en puerta</span>
        </div>
      </div>

      {/* Alertas del evento: punto + texto en tinta. */}
      {alerts.length > 0 && (
        <ul className="a-chips">
          {alerts.map((al, i) => <li key={i} className={`a-chip a-chip--${al.tone}`}>{al.text}</li>)}
        </ul>
      )}

      {/* Entradas por tipo */}
      <section className="s-section">
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Entradas por tipo</h2>
        {types.length === 0 ? (
          <div className="s-card"><p className="s-empty">Este evento no tiene tipos de entrada todavía.</p></div>
        ) : (
          <div className="s-card s-card--flush" style={{ overflowX: 'auto' }}>
            {/* s-table--stack: en ≤640 la tabla se vuelve lista y cada número
                se lleva su etiqueta (data-l), en vez de deslizar 540px de
                ancho dentro de una pantalla de 358. */}
            <table className="a-typetable s-table--stack">
              <thead><tr><th>Tipo</th><th className="num">Capacidad</th><th className="num">Emitidas</th><th className="num">Libres</th><th className="num">Escaneados</th><th className="num">Recaudado</th></tr></thead>
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
                        <strong>{t.name}</strong>{!t.is_active && <span className="s-badge s-badge--draft s-badge--inline">inactivo</span>}
                        {phase && <span className="a-phase">Precio actual: {phase}</span>}
                      </td>
                      <td className="num" data-l="Capacidad">{t.is_unlimited ? '∞' : t.capacity}</td>
                      <td className="num" data-l="Emitidas">{sold}</td>
                      <td className="num" data-l="Libres">{t.is_unlimited ? '—' : libres}</td>
                      <td className="num" data-l="Escaneados">{scanned}</td>
                      <td className="num" data-l="Recaudado">{formatPEN(rec)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num" data-l="Capacidad">{capTotal > 0 ? capTotal : (hasUnlimited ? '∞' : '—')}</td>
                  <td className="num" data-l="Emitidas">{totalSold}</td>
                  <td className="num" data-l="Libres">{capTotal > 0 ? Math.max(0, capTotal - soldCapped) : '—'}</td>
                  <td className="num" data-l="Escaneados">{totalScanned}</td>
                  <td className="num" data-l="Recaudado">{formatPEN(recTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Ventas por día: una columna por día (los últimos 14 con ventas); la
          última, en blanco. El monto de cada día va en el title y en el texto
          para lectores de pantalla. */}
      {paidRows.length > 0 && byDay.length > 0 && (
        <section className="s-section">
          <h2 className="s-h2" style={{ marginBottom: 12 }}>Ventas por día</h2>
          <div className="s-card">
            <ol className="a-chart" aria-label="Ventas por día">
              {byDay.map(([day, cents], i) => (
                <li key={day} className={`a-chart__col${i === byDay.length - 1 ? ' a-chart__col--last' : ''}`} title={`${day}: ${formatPEN(cents)}`}>
                  <span className="a-chart__bar" style={{ height: `${Math.max(4, Math.round((cents / maxDay) * 100))}%` }} />
                  <span className="a-chart__sr">{day}: {formatPEN(cents)}</span>
                </li>
              ))}
            </ol>
            <div className="a-chart__axis">
              <span>{byDay[0]![0]}</span>
              <span>{byDay[byDay.length - 1]![0]} · {formatPEN(byDay[byDay.length - 1]![1])}</span>
            </div>
          </div>
        </section>
      )}

      <p className="a-print">
        <Link href={`/admin/events/${event.id}/reporte`} className="s-btn s-btn--soft s-btn--sm">
          <Printer aria-hidden="true" /> Reporte para imprimir
        </Link>
      </p>

      {/* 5) LO RARO, PLEGADO — los rechazados son historial, no trabajo. */}
      {rejectedRows.length > 0 && (
        <details className="s-fold s-folds">
          <summary>
            <span className="s-fold__t">
              Yapes rechazados ({rejectedRows.length})
              <span className="s-fold__hint">Los comprobantes que no aprobaste, con el motivo.</span>
            </span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="s-fold__body">
            <ul className="s-hlist">
              {rejectedRows.map((r) => (
                <li key={r.id} className="s-hlist__row">
                  <span style={{ minWidth: 0 }}>
                    <strong>{r.order?.buyer_name ?? '—'}</strong><span className="s-muted s-small"> · {r.order?.buyer_email}</span>
                    {r.reject_reason && <span className="s-muted s-small" style={{ display: 'block' }}>Motivo: {r.reject_reason}</span>}
                  </span>
                  <span className="s-muted s-small" style={{ textAlign: 'right', flexShrink: 0 }}>
                    {formatPEN(r.amount_cents)}<br />
                    {r.reviewed_at && new Date(r.reviewed_at).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </>
  );
}
