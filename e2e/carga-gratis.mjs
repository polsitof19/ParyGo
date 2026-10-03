// PRUEBA DE CARGA del reclamo gratis — contra la base de PRODUCCIÓN, en demotest.
//
//   node e2e/carga-gratis.mjs [--n 2000] [--aforo 500] [--concurrencia 100]
//                             [--limite 2] [--seg 60]
//
// QUÉ MIDE Y QUÉ NO
// Esto ejercita el EMBUDO DE ESCRITURA real —insert de la orden, order_items,
// reserve_order_stock (cupo + tope por persona, con locks) y
// issue_tickets_atomic (emisión)—, que es donde vive el riesgo de sobreventa.
// NO pasa por Cloudflare ni por el server action, y por eso NO manda emails:
// disparar 2000 correos a direcciones inventadas quemaría la cuota de Resend y
// la reputación del dominio. La capa HTTP se mide aparte (carga-http.mjs).
//
// LO ÚNICO QUE NO SE NEGOCIA: entradas emitidas == aforo. Ni una más.
import { svc, log } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? Number(args[i + 1]) : d; };
const N = flag('--n', 2000);
const AFORO = flag('--aforo', 500);
const CONC = flag('--concurrencia', 100);
const LIMITE = flag('--limite', 2);
const SEG = flag('--seg', 60);

const STAMP = String(Date.now()).slice(-6);
const { data: marca } = await svc.from('brands').select('id, archived_at').eq('slug', 'demotest').single();
if (!marca) throw new Error('demotest no encontrada');
const estabaArchivada = !!marca.archived_at;

const inicio = new Date(Date.now() + 15 * 86400000);
const { data: ev, error: evErr } = await svc.from('events').insert({
  brand_id: marca.id,
  slug: `e2e-carga-${STAMP}`,
  name: `E2E Carga ${STAMP}`,
  starts_at: inicio.toISOString(),
  ends_at: new Date(inicio.getTime() + 8 * 3600000).toISOString(),
  venue_name: 'Local E2E', is_published: false, is_free: true, min_age: 0,
  max_per_person: LIMITE,
}).select('id').single();
if (evErr) throw new Error('evento: ' + evErr.message);
const { data: tt, error: ttErr } = await svc.from('ticket_types').insert({
  event_id: ev.id, name: 'Entrada', price_cents: 0, capacity: AFORO,
  is_active: true, is_unlimited: false, is_courtesy: false, max_scans: 1, sort_order: 1,
}).select('id').single();
if (ttErr) throw new Error('tipo: ' + ttErr.message);

log(`evento de carga: ${ev.id} · aforo ${AFORO} · tope por persona ${LIMITE}`);
log(`disparando ${N} reclamos con ${CONC} en vuelo (ráfaga de ~${SEG}s)…`);

// Un reclamo = lo mismo que hace startCheckout del lado del server, sin HTTP:
// orden → líneas → reserva (cupo + tope) → emisión atómica.
const lat = [];
const errores = new Map();
let emitidos = 0;
const cuentaError = (e) => {
  const k = /insufficient_stock/.test(e) ? 'agotado'
    : /per_person_limit/.test(e) ? 'tope_por_persona'
      : /oversold_no_capacity/.test(e) ? 'emision_sin_cupo'
        : /timeout|fetch failed|ECONNRESET|socket/i.test(e) ? 'red'
          : e.slice(0, 80);
  errores.set(k, (errores.get(k) ?? 0) + 1);
};

async function reclamo(i) {
  const t0 = Date.now();
  const email = `carga-${STAMP}-${i}@test.local`;
  try {
    const { data: o, error: oErr } = await svc.from('orders').insert({
      event_id: ev.id, brand_id: marca.id,
      buyer_name: `Carga ${i}`, buyer_email: email, buyer_phone: '+51999111222',
      buyer_dni: String(10000000 + i), buyer_doc_type: 'dni', buyer_age_ok: true, marketing_opt_in: false,
      payment_method: 'yape_manual', subtotal_cents: 0, total_cents: 0, discount_cents: 0,
      status: 'pending_yape_review',
    }).select('id').single();
    if (oErr) throw new Error('orden: ' + oErr.message);

    const { error: iErr } = await svc.from('order_items').insert({
      order_id: o.id, ticket_type_id: tt.id, ticket_type_name: 'Entrada',
      quantity: 1, unit_price_cents: 0, subtotal_cents: 0,
    });
    if (iErr) throw new Error('items: ' + iErr.message);

    const { error: rErr } = await svc.rpc('reserve_order_stock', { p_order_id: o.id, p_session_id: `carga-${STAMP}-${i}` });
    if (rErr) {
      await svc.from('orders').update({ status: 'failed' }).eq('id', o.id);
      throw new Error(rErr.message);
    }
    const { error: eErr } = await svc.rpc('issue_tickets_atomic', { p_order_id: o.id });
    if (eErr) {
      await svc.from('orders').update({ status: 'failed' }).eq('id', o.id);
      await svc.rpc('release_stock_reservations_for_order', { p_order_id: o.id });
      throw new Error(eErr.message);
    }
    emitidos += 1;
  } catch (e) {
    cuentaError(String(e.message ?? e));
  } finally {
    lat.push(Date.now() - t0);
  }
}

// Ráfaga: N reclamos repartidos en SEG segundos, con CONC en vuelo como techo.
const t0 = Date.now();
const intervalo = (SEG * 1000) / N;
let siguiente = 0;
const enVuelo = new Set();
while (siguiente < N) {
  while (enVuelo.size >= CONC) await Promise.race(enVuelo);
  const i = siguiente++;
  const p = reclamo(i).finally(() => enVuelo.delete(p));
  enVuelo.add(p);
  const objetivo = t0 + i * intervalo;
  const espera = objetivo - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
}
await Promise.all(enVuelo);
const dur = (Date.now() - t0) / 1000;

lat.sort((a, b) => a - b);
const pct = (p) => lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))];

// ---- la verdad sale de la BASE, no del contador del script ----
const { count: tickets } = await svc.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', ev.id);
const { data: tipo } = await svc.from('ticket_types').select('sold, capacity').eq('id', tt.id).single();
const { count: pagadas } = await svc.from('orders').select('id', { count: 'exact', head: true }).eq('event_id', ev.id).eq('status', 'paid');

log(`\n=== RESULTADO (${dur.toFixed(1)}s, ${(N / dur).toFixed(1)} reclamos/s) ===`);
log(`emitidos según el script : ${emitidos}`);
log(`tickets en la base       : ${tickets}`);
log(`ticket_types.sold        : ${tipo.sold} / capacity ${tipo.capacity}`);
log(`órdenes pagadas          : ${pagadas}`);
log(`latencia ms  p50 ${pct(50)} · p95 ${pct(95)} · p99 ${pct(99)} · max ${lat[lat.length - 1]}`);
log(`errores: ${JSON.stringify(Object.fromEntries(errores))}`);

const sobreventa = (tickets ?? 0) > AFORO || tipo.sold > tipo.capacity;
log(sobreventa ? '\n❌ SOBREVENTA' : `\n✔ CERO SOBREVENTA (${tickets}/${AFORO})`);

// Limpieza: el evento queda archivado; cleanup.mjs archiva los e2e-* igual.
await svc.from('events').update({ archived_at: new Date().toISOString() }).eq('id', ev.id);
if (estabaArchivada) await svc.from('brands').update({ archived_at: new Date().toISOString() }).eq('id', marca.id);
process.exit(sobreventa ? 1 : 0);
