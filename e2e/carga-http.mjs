// CARGA DE LA CAPA HTTP: la página pública del evento, servida por Cloudflare
// + el SSR de Next + las lecturas a Supabase. Solo LECTURAS: no crea órdenes,
// no manda emails.
//
//   node e2e/carga-http.mjs [--n 500] [--concurrencia 50] [--seg 60] [--url <url>]
//
// Sin --url crea un evento gratis publicado en demotest, lo mide y lo archiva.
import { svc, log } from './lib.mjs';

const args = process.argv.slice(2);
const num = (n, d) => { const i = args.indexOf(n); return i >= 0 ? Number(args[i + 1]) : d; };
const str = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const N = num('--n', 500);
const CONC = num('--concurrencia', 50);
const SEG = num('--seg', 60);
let URL_OBJETIVO = str('--url', null);

const STAMP = String(Date.now()).slice(-6);
let ev = null;
let marca = null;
let estabaArchivada = false;

if (!URL_OBJETIVO) {
  const { data: m } = await svc.from('brands').select('id, slug, archived_at').eq('slug', 'demotest').single();
  marca = m;
  estabaArchivada = !!m.archived_at;
  if (estabaArchivada) await svc.from('brands').update({ archived_at: null }).eq('id', m.id);
  const inicio = new Date(Date.now() + 15 * 86400000);
  const { data: e, error } = await svc.from('events').insert({
    brand_id: m.id, slug: `e2e-http-${STAMP}`, name: `E2E HTTP ${STAMP}`,
    starts_at: inicio.toISOString(), ends_at: new Date(inicio.getTime() + 8 * 3600000).toISOString(),
    venue_name: 'Local E2E', is_published: true, is_free: true, min_age: 0, max_per_person: 2,
  }).select('id, slug').single();
  if (error) throw new Error('evento: ' + error.message);
  ev = e;
  await svc.from('ticket_types').insert({
    event_id: e.id, name: 'Entrada', price_cents: 0, capacity: 3000,
    is_active: true, is_unlimited: false, is_courtesy: false, max_scans: 1, sort_order: 1,
  });
  URL_OBJETIVO = `https://demotest.parygo.com/${e.slug}`;
}

log(`midiendo ${N} cargas de ${URL_OBJETIVO} (${CONC} en vuelo, ~${SEG}s)…`);

const lat = [];
const codigos = new Map();
let bytes = 0;
async function pedido() {
  const t0 = Date.now();
  try {
    const r = await fetch(URL_OBJETIVO, { headers: { 'user-agent': 'ParyGo-loadtest/1.0' } });
    const txt = await r.text();
    bytes += txt.length;
    // No alcanza con el 200: la página tiene que traer el bloque de compra.
    const ok = r.status === 200 && /Reclama tu entrada gratis|ELIGE TU ENTRADA|b-buy/i.test(txt);
    const k = `${r.status}${ok ? '' : ' (200 sin contenido de compra)'}`;
    codigos.set(k, (codigos.get(k) ?? 0) + 1);
    const cf = r.headers.get('cf-cache-status');
    if (cf) codigos.set('cf:' + cf, (codigos.get('cf:' + cf) ?? 0) + 1);
  } catch (e) {
    const k = 'ERROR ' + String(e.message ?? e).slice(0, 60);
    codigos.set(k, (codigos.get(k) ?? 0) + 1);
  } finally {
    lat.push(Date.now() - t0);
  }
}

const t0 = Date.now();
const intervalo = (SEG * 1000) / N;
const enVuelo = new Set();
for (let i = 0; i < N; i++) {
  while (enVuelo.size >= CONC) await Promise.race(enVuelo);
  const p = pedido().finally(() => enVuelo.delete(p));
  enVuelo.add(p);
  const espera = t0 + i * intervalo - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
}
await Promise.all(enVuelo);
const dur = (Date.now() - t0) / 1000;

lat.sort((a, b) => a - b);
const pct = (p) => lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))];
log(`\n=== HTTP (${dur.toFixed(1)}s, ${(N / dur).toFixed(1)} req/s) ===`);
log(`latencia ms  p50 ${pct(50)} · p95 ${pct(95)} · p99 ${pct(99)} · max ${lat[lat.length - 1]}`);
log(`respuestas: ${JSON.stringify(Object.fromEntries(codigos))}`);
log(`peso medio: ${(bytes / N / 1024).toFixed(1)} KB`);

if (ev) {
  await svc.from('events').update({ archived_at: new Date().toISOString(), is_published: false }).eq('id', ev.id);
  if (estabaArchivada) await svc.from('brands').update({ archived_at: new Date().toISOString() }).eq('id', marca.id);
  log('evento de prueba archivado; demotest queda como estaba');
}
