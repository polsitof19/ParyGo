import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';
import { YapeReviewRow } from '@/app/admin/yape/YapeReviewRow';
import { publicEnv } from '@/lib/env';
import { EventButtons, QuickActions } from './QuickActions';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function AdminEventResumenPage({ params }: { params: { id: string } }) {
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
    admin.from('orders').select('id, total_cents, payment_method, created_at').eq('event_id', event.id).eq('status', 'paid'),
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
    admin.from('tickets').select('order_id').eq('event_id', event.id).is('invalidated_at', null),
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

      {/* 1) PENDIENTE — la cola de Yapes con la cifra héroe. Aprobar/Rechazar
          son los reales (YapeReviewRow); el primario es el de la fila abierta. */}
      {pendingCount > 0 && (
        <section className="s-due-queue" aria-labelledby="yape-inline-title">
          <div className="s-due s-due--queue">
            <div className="s-due__txt">
              <span className="s-due__k">Por revisar</span>
              <h2 id="yape-inline-title" className="s-due__n">
                {pendingCount} Yape{pendingCount === 1 ? '' : 's'}
              </h2>
              {/* La instrucción va UNA vez arriba de la lista, no repetida en cada fila. */}
              <p className="s-due__sub">
                {formatPEN(pendingCents)} esperando tu aprobación. Abre tu Yape → Movimientos: si el monto, el N° de
                operación y el nombre coinciden, aprueba. Toca una fila para ver la captura.
              </p>
            </div>
          </div>
          <div>
            {pendingReview.map((p) => (
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
                createdAt={p.created_at}
                total={formatPEN(p.order?.total_cents ?? 0)}
                items={p.items}
                impersonating={impersonating}
              />
            ))}
          </div>
        </section>
      )}

      {/* Alertas del evento: punto + texto en tinta. */}
      {alerts.length > 0 && (
        <ul className="a-chips">
          {alerts.map((al, i) => <li key={i} className={`a-chip a-chip--${al.tone}`}>{al.text}</li>)}
        </ul>
      )}

      {noSalesYet && pendingCount === 0 && (
        <p className="s-notice" style={{ marginBottom: 16 }}>Aún no vendiste. Comparte tu link en historias y grupos: es lo que más mueve la venta.</p>
      )}

      {/* 3) Los dos botones (escáner · copiar link) y las acciones agrupadas.
          Con Yapes por aprobar el primario es el de la fila abierta: el
          escáner baja a secundario (uno solo por pantalla). */}
      <EventButtons publicUrl={publicUrl} isPublished={!!event.is_published} scannerPrimary={pendingCount === 0} readOnly={impersonating} />
      <QuickActions eventId={event.id} publicUrl={publicUrl} isPublished={!!event.is_published} readOnly={impersonating} showPublic={false} />

    </>
  );
}
