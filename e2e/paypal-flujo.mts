// Vuelta del comprador y aviso (webhook) de PayPal — lib/paypalMarca.ts contra
// la base REAL con PayPal INTERCEPTADO (un PayPal falso en memoria). Marca
// temporal is_test en USD (se borra al final); no se toca ninguna marca real.
//   cd apps/web && npx tsx ../../e2e/paypal-flujo.mts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

for (const l of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const line = l.trim();
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  const k = line.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

// ---------- PayPal falso ----------
type Cap = { id: string; status: string; value: string; custom: string; ppOrder: string };
const capturas = new Map<string, Cap>();
const pp = { capturaValor: '24.68', capturaError: '' as string, capturaStatus: 'COMPLETED' };
let llamadasPaypal: string[] = [];
let nCap = 0;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const fetchReal = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url);
  if (!u.startsWith('https://api-m.sandbox.paypal.com/')) return fetchReal(url, init);
  llamadasPaypal.push(`${init?.method ?? 'GET'} ${u.replace('https://api-m.sandbox.paypal.com', '')}`);
  if (u.endsWith('/v1/oauth2/token')) return json({ access_token: 'TOK' });
  let m = /\/v2\/checkout\/orders\/([A-Z0-9]+)\/capture$/.exec(u);
  if (m) {
    if (pp.capturaError) return json({ details: [{ issue: pp.capturaError }] }, 422);
    const ppOrder = m[1]!;
    const custom = ordenDePaypal.get(ppOrder) ?? 'desconocida';
    const cap: Cap = { id: `CAP${++nCap}X${Date.now() % 1e6}`, status: pp.capturaStatus, value: pp.capturaValor, custom, ppOrder };
    capturas.set(cap.id, cap);
    return json({ id: ppOrder, status: 'COMPLETED', purchase_units: [{ custom_id: custom, payments: { captures: [{ id: cap.id, status: cap.status, custom_id: custom, amount: { currency_code: 'USD', value: cap.value } }] } }] }, 201);
  }
  m = /\/v2\/payments\/captures\/([A-Z0-9]+)\/refund$/.exec(u);
  if (m) { const c = capturas.get(m[1]!); if (c) c.status = 'REFUNDED'; return json({ id: 'R1', status: 'COMPLETED' }, 201); }
  m = /\/v2\/payments\/captures\/([A-Z0-9]+)$/.exec(u);
  if (m) {
    const c = capturas.get(m[1]!);
    if (!c) return json({}, 404);
    return json({ id: c.id, status: c.status, custom_id: c.custom, amount: { currency_code: 'USD', value: c.value }, supplementary_data: { related_ids: { order_id: c.ppOrder } } });
  }
  return json({}, 500);
}) as typeof fetch;
const ordenDePaypal = new Map<string, string>();

const { createAdminClient } = await import('@/lib/supabase/admin');
const { cobrarVueltaPaypal, procesarAvisoPaypal } = await import('@/lib/paypalMarca');
const admin = createAdminClient();
const KEY = process.env.BRAND_CREDS_ENCRYPTION_KEY!;

let ok = 0, mal = 0;
const check = (n: string, c: boolean, d = '') => { c ? ok++ : mal++; console.log(`${c ? '✔' : '✘'} ${n}${d ? ' · ' + d : ''}`); };

const STAMP = Date.now().toString().slice(-6);
const CLIENTE = `e2e-flujo-${STAMP}-client`;
const { data: b, error: eB } = await admin.from('brands').insert({
  slug: `e2e-ppf-${STAMP}`, name: 'E2E PayPal flujo', is_test: true, archived_at: new Date().toISOString(),
  moneda: 'USD', zona_horaria: 'America/New_York', metodo_manual: 'transferencia',
}).select('id').single();
if (eB || !b) throw new Error(eB?.message);
const B = b.id;
const { data: ev } = await admin.from('events').insert({
  brand_id: B, slug: `e2e-ppf-${STAMP}`, name: 'E2E PayPal flujo',
  starts_at: new Date(Date.now() + 15 * 864e5).toISOString(), ends_at: new Date(Date.now() + 15 * 864e5 + 8 * 36e5).toISOString(),
  venue_name: 'Local E2E', is_published: false, is_free: false, min_age: 0,
}).select('id').single();
const { data: tt } = await admin.from('ticket_types').insert({
  event_id: ev!.id, name: 'General', price_cents: 1234, capacity: 20, is_unlimited: false, max_scans: 1, is_active: true,
}).select('id, name').single();
await admin.rpc('set_brand_paypal', { p_brand_id: B, p_client_id: CLIENTE, p_secret: 'secreto-e2e', p_webhook_id: 'WH', p_sandbox: true, p_encryption_key: KEY });

let nOrd = 0;
const orden = async (cliente = CLIENTE) => {
  const ppOrder = `PPF${STAMP}N${++nOrd}`;
  const { data, error } = await admin.from('orders').insert({
    event_id: ev!.id, brand_id: B, buyer_name: 'E2E PPF', buyer_email: `e2e-ppf-${STAMP}@parygo.test`, buyer_phone: '999999999',
    buyer_age_ok: true, payment_method: 'paypal', status: 'pending_payment', subtotal_cents: 2468, total_cents: 2468,
    paypal_order_id: ppOrder, paypal_client_id: cliente,
  }).select('id').single();
  if (error || !data) throw new Error(error?.message);
  await admin.from('order_items').insert({ order_id: data.id, ticket_type_id: tt!.id, ticket_type_name: tt!.name, quantity: 2, unit_price_cents: 1234, subtotal_cents: 2468 });
  ordenDePaypal.set(ppOrder, data.id);
  return { id: data.id, ppOrder };
};
const estado = async (id: string) => (await admin.from('orders').select('status, paypal_capture_id').eq('id', id).single()).data!;
const entradas = async (id: string) => (await admin.from('tickets').select('id, invalidated_at').eq('order_id', id)).data ?? [];
const huboCaptura = () => llamadasPaypal.some((l) => l.endsWith('/capture'));
// El candado del aviso (10 s por evento y captura) se libera entre pasos: acá
// los avisos de la misma captura llegan seguidos a propósito.
const aviso = async (evento: string, recurso: Record<string, unknown>) => {
  await admin.from('candados_alta').delete().like('clave', 'pp_aviso:%');
  return procesarAvisoPaypal(admin, B, evento, recurso, KEY);
};

try {
  // 1. vuelta feliz
  const o1 = await orden();
  llamadasPaypal = [];
  const r1 = await cobrarVueltaPaypal(admin, B, o1.id, o1.ppOrder, KEY);
  check('vuelta: captura y emite', r1.ok && r1.action === 'issued', JSON.stringify(r1));
  check('vuelta: 2 entradas y orden paid con la captura', (await entradas(o1.id)).length === 2 && (await estado(o1.id)).status === 'paid' && !!(await estado(o1.id)).paypal_capture_id);
  llamadasPaypal = [];
  const r1b = await cobrarVueltaPaypal(admin, B, o1.id, o1.ppOrder, KEY);
  check('vuelta repetida: ya pagada, sin volver a capturar', r1b.ok && r1b.action === 'already_issued' && !huboCaptura(), JSON.stringify(r1b));

  // 2. token de otra orden de PayPal
  const o2 = await orden();
  llamadasPaypal = [];
  const r2 = await cobrarVueltaPaypal(admin, B, o2.id, 'PPOTRAORDEN1', KEY);
  check('vuelta con token ajeno: no captura', !r2.ok && r2.motivo === 'ignorado' && !huboCaptura(), JSON.stringify(r2));

  // 3. credenciales cambiaron
  const o3 = await orden('otra-app-vieja-client-id');
  llamadasPaypal = [];
  const r3 = await cobrarVueltaPaypal(admin, B, o3.id, o3.ppOrder, KEY);
  check('orden creada con otra app: no captura', !r3.ok && r3.motivo === 'credenciales_cambiaron' && !huboCaptura(), JSON.stringify(r3));

  // 4. sin cupo → no se captura
  const { data: s0 } = await admin.from('ticket_types').select('sold').eq('id', tt!.id).single();
  await admin.from('ticket_types').update({ capacity: s0!.sold + 1 }).eq('id', tt!.id);
  llamadasPaypal = [];
  const r4 = await cobrarVueltaPaypal(admin, B, o2.id, o2.ppOrder, KEY);
  check('sin cupo: no captura (no se cobra)', !r4.ok && r4.motivo === 'sin_cupo' && !huboCaptura(), JSON.stringify(r4));
  await admin.from('ticket_types').update({ capacity: 20 }).eq('id', tt!.id);

  // 5. PayPal cobra otro monto → devolución automática
  pp.capturaValor = '24.67';
  llamadasPaypal = [];
  const r5 = await cobrarVueltaPaypal(admin, B, o2.id, o2.ppOrder, KEY);
  const e5 = await estado(o2.id);
  const { count: nAuto } = await admin.from('events_log').select('id', { count: 'exact', head: true }).eq('order_id', o2.id).eq('type', 'paypal_auto_refund');
  check('monto distinto: se devuelve solo', !r5.ok && r5.motivo === 'devuelto' && llamadasPaypal.some((l) => l.endsWith('/refund')), JSON.stringify(r5));
  check('monto distinto: orden refunded sin entradas y en la bitácora', e5.status === 'refunded' && (await entradas(o2.id)).length === 0 && nAuto === 1, JSON.stringify(e5));
  pp.capturaValor = '24.68';

  // 6. rechazo
  const o6 = await orden();
  pp.capturaError = 'INSTRUMENT_DECLINED';
  const r6 = await cobrarVueltaPaypal(admin, B, o6.id, o6.ppOrder, KEY);
  check('tarjeta rechazada → rechazado', !r6.ok && r6.motivo === 'rechazado', JSON.stringify(r6));
  pp.capturaError = '';

  // 7. avisos que no son nuestros: CERO llamadas a PayPal
  llamadasPaypal = [];
  const a1 = await aviso('PAYMENT.CAPTURE.COMPLETED', { id: 'CAPINVENTADA1', supplementary_data: { related_ids: { order_id: 'PPNOEXISTE1' } } });
  const a2 = await aviso('PAYMENT.CAPTURE.REFUNDED', { id: 'CAPINVENTADA2' });
  const a3 = await aviso('PAYMENT.CAPTURE.COMPLETED', { id: 'x' });
  const a4 = await aviso('CHECKOUT.ORDER.APPROVED', { id: 'CAPINVENTADA3' });
  check('avisos inventados: ignorados sin llamar a PayPal', [a1, a2, a3, a4].every((a) => !a.ok && a.motivo === 'ignorado') && llamadasPaypal.length === 0, llamadasPaypal.join(','));

  // 8. COMPLETED de una orden cuya vuelta nunca llegó → emite
  const o8 = await orden();
  const capRes = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${o8.ppOrder}/capture`, { method: 'POST' });
  const cap8 = ((await capRes.json()) as { purchase_units: { payments: { captures: { id: string }[] } }[] }).purchase_units[0]!.payments.captures[0]!.id;
  const a8 = await aviso('PAYMENT.CAPTURE.COMPLETED', { id: cap8, supplementary_data: { related_ids: { order_id: o8.ppOrder } } });
  check('aviso COMPLETED sin vuelta → emite', a8.ok && a8.action === 'issued' && (await entradas(o8.id)).length === 2, JSON.stringify(a8));

  // 9. devolución parcial no anula; total sí
  const cap1 = (await estado(o1.id)).paypal_capture_id!;
  capturas.get(cap1)!.status = 'PARTIALLY_REFUNDED';
  const a9 = await aviso('PAYMENT.CAPTURE.REFUNDED', { id: cap1 });
  check('devolución parcial: no anula', !a9.ok && a9.motivo === 'ignorado' && (await entradas(o1.id)).every((t) => !t.invalidated_at), JSON.stringify(a9));
  capturas.get(cap1)!.status = 'REFUNDED';
  const a10 = await aviso('PAYMENT.CAPTURE.REFUNDED', { id: cap1 });
  check('devolución total: refunded y entradas anuladas', !a10.ok && a10.motivo === 'devuelto' && (await estado(o1.id)).status === 'refunded' && (await entradas(o1.id)).every((t) => !!t.invalidated_at), JSON.stringify(a10));
  capturas.get(cap8)!.status = 'REVERSED';
  const a11 = await aviso('PAYMENT.CAPTURE.REVERSED', { id: cap8 });
  check('contracargo: refunded y entradas anuladas', (await estado(o8.id)).status === 'refunded' && (await entradas(o8.id)).every((t) => !!t.invalidated_at), JSON.stringify(a11));

  // 10. una captura de OTRA orden no se aplica a esta
  const o12 = await orden();
  const c12 = capturas.get(cap1)!;
  capturas.set('CAPAJENA1', { ...c12, id: 'CAPAJENA1', status: 'COMPLETED', custom: o1.id, ppOrder: o12.ppOrder });
  const a12 = await aviso('PAYMENT.CAPTURE.COMPLETED', { id: 'CAPAJENA1', supplementary_data: { related_ids: { order_id: o12.ppOrder } } });
  check('captura con custom_id de otra orden: ignorada', !a12.ok && a12.motivo === 'ignorado' && (await entradas(o12.id)).length === 0, JSON.stringify(a12));
} finally {
  const { data: ords } = await admin.from('orders').select('id').eq('brand_id', B);
  for (const { id } of ords ?? []) {
    await admin.from('tickets').delete().eq('order_id', id);
    await admin.from('promo_redemptions').delete().eq('order_id', id);
    await admin.from('stock_reservations').delete().eq('order_id', id);
    await admin.from('order_items').delete().eq('order_id', id);
  }
  await admin.from('events_log').delete().eq('brand_id', B);
  await admin.from('orders').delete().eq('brand_id', B);
  await admin.from('ticket_types').delete().eq('event_id', ev!.id);
  await admin.from('events').delete().eq('brand_id', B);
  await admin.from('brands').delete().eq('id', B);
  await admin.from('candados_alta').delete().like('clave', 'pp_%');
  const { count } = await admin.from('brands').select('id', { count: 'exact', head: true }).eq('id', B);
  check('marca temporal borrada', count === 0);
}

console.log(`${ok}/${ok + mal} OK`);
process.exit(mal ? 1 : 0);
