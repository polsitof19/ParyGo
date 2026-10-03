// CARGA DEL RECLAMO COMPLETO, POR HTTP — Cloudflare + server action + base.
//
//   node e2e/carga-reclamo-http.mjs [--n 3000] [--seg 60] [--concurrencia 150]
//                                   [--aforo 10000] [--limite 5]
//
// A diferencia de carga-gratis.mjs (que habla con la base), esto recorre el
// camino REAL de una persona: la server action `startCheckout` servida por
// Cloudflare. Se abre UNA vez el navegador para capturar el pedido auténtico
// —con su id de acción y sus cabeceras— y después se repite ese pedido N veces
// cambiando comprador, documento y sesión.
//
// EMAILS: cada reclamo encola su entrada (0062). Antes de correr esto hay que
// APAGAR el cron de notificaciones y borrar los jobs al terminar, o Resend
// manda miles de correos a direcciones inventadas y el dominio se quema a
// rebotes. El script avisa si el cron está activo y no arranca.
import { chromium } from 'playwright';
import { svc, log } from './lib.mjs';
import { query } from '../supabase/mgmt.mjs';

const args = process.argv.slice(2);
const num = (n, d) => { const i = args.indexOf(n); return i >= 0 ? Number(args[i + 1]) : d; };
const N = num('--n', 3000);
const SEG = num('--seg', 60);
const CONC = num('--concurrencia', 150);
const AFORO = num('--aforo', 10000);
const LIMITE = num('--limite', 5);
const BASE = process.env.E2E_BASE || 'https://demotest.parygo.com';

// ---- candado: el cron de notificaciones tiene que estar apagado ----
const cron = await query("select active from cron.job where jobname = 'parygo-notifications'");
if (cron[0]?.active) {
  log('FRENO: el cron parygo-notifications está ACTIVO. Apagalo antes de correr esto');
  log("  node supabase/mgmt.mjs sql \"select cron.alter_job((select jobid from cron.job where jobname='parygo-notifications'), active => false)\"");
  process.exit(1);
}

const STAMP = String(Date.now()).slice(-6);
const { data: marca } = await svc.from('brands').select('id, archived_at').eq('slug', 'demotest').single();
const estabaArchivada = !!marca.archived_at;
if (estabaArchivada) await svc.from('brands').update({ archived_at: null }).eq('id', marca.id);

const inicio = new Date(Date.now() + 16 * 86400000);
const { data: ev, error: evErr } = await svc.from('events').insert({
  brand_id: marca.id, slug: `e2e-carga-http-${STAMP}`, name: `E2E Carga HTTP ${STAMP}`,
  starts_at: inicio.toISOString(), ends_at: new Date(inicio.getTime() + 8 * 3600000).toISOString(),
  venue_name: 'Local E2E', is_published: true, is_free: true, min_age: 0, max_per_person: LIMITE,
}).select('id, slug').single();
if (evErr) throw new Error('evento: ' + evErr.message);
const { data: tt } = await svc.from('ticket_types').insert({
  event_id: ev.id, name: 'Entrada', price_cents: 0, capacity: AFORO,
  is_active: true, is_unlimited: false, is_courtesy: false, max_scans: 1, sort_order: 1,
}).select('id').single();
log(`evento: ${BASE}/${ev.slug} · aforo ${AFORO} · tope ${LIMITE}`);

// ---- 1. capturar un reclamo REAL con el navegador ----
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-PE', timezoneId: 'America/Lima' });
const page = await ctx.newPage();
await page.goto(`${BASE}/${ev.slug}`, { waitUntil: 'load', timeout: 90000 });
const vis = (l) => l.filter({ visible: true }).first();
await vis(page.getByRole('button', { name: 'Sumar Entrada' })).click();
await page.waitForTimeout(1500);
await vis(page.locator('.b-cta .b-btn--go, .b-sum .b-btn--go')).click();
await page.locator('#buyer_name').waitFor({ timeout: 20000 });
await page.fill('#buyer_name', `Carga 0`);
await page.fill('#buyer_email', `carga-http-${STAMP}-0@test.local`);
await page.fill('#buyer_phone', '+51 999 111 222');
if (await page.locator('#buyer_dni').count()) await page.fill('#buyer_dni', '20000000');
if (await page.locator('input[name="age_ok"]').count()) await page.check('input[name="age_ok"]');
const capturaP = page.waitForRequest((q) => q.method() === 'POST' && !!q.headers()['next-action'] && (q.postData() || '').includes('"buyerEmail"'), { timeout: 40000 });
await vis(page.locator('button[type=submit][form="checkout-form"]')).click();
const captura = await capturaP;
const plantilla = { url: captura.url(), headers: captura.headers(), body: captura.postData() };
await page.waitForTimeout(2500);
await browser.close();
log('pedido real capturado; repitiendo…');

const CUERPO = JSON.parse(plantilla.body);
const CABECERAS = Object.fromEntries(
  Object.entries(plantilla.headers).filter(([k]) =>
    ['next-action', 'next-router-state-tree', 'content-type', 'accept', 'user-agent'].includes(k))
);

const lat = [];
const resultados = new Map();
const cuenta = (k) => resultados.set(k, (resultados.get(k) ?? 0) + 1);
let exitos = 0;

async function reclamo(i) {
  const t0 = Date.now();
  const arg = { ...CUERPO[0] };
  arg.buyerName = `Carga ${i}`;
  arg.buyerEmail = `carga-http-${STAMP}-${i}@test.local`;
  arg.buyerDni = String(20000001 + i);
  arg.sessionId = `carga-http-${STAMP}-${i}-sesion`;
  try {
    const r = await fetch(plantilla.url, { method: 'POST', headers: CABECERAS, body: JSON.stringify([arg]) });
    const txt = await r.text();
    if (r.status === 503) cuenta('503');
    else if (/confirmacion\?order=/.test(txt)) { exitos += 1; cuenta('ok'); }
    else if (/Total inválido/.test(txt)) cuenta('total_invalido');
    else if (/agotaron/.test(txt)) cuenta('agotado');
    else if (/por persona/.test(txt)) cuenta('tope_por_persona');
    else cuenta(`otro_${r.status}`);
  } catch (e) {
    cuenta('red_' + String(e.message ?? e).slice(0, 40));
  } finally {
    lat.push(Date.now() - t0);
  }
}

const t0 = Date.now();
const intervalo = (SEG * 1000) / N;
const enVuelo = new Set();
for (let i = 1; i <= N; i++) {
  while (enVuelo.size >= CONC) await Promise.race(enVuelo);
  const p = reclamo(i).finally(() => enVuelo.delete(p));
  enVuelo.add(p);
  const espera = t0 + i * intervalo - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
}
await Promise.all(enVuelo);
const dur = (Date.now() - t0) / 1000;

lat.sort((a, b) => a - b);
const pct = (p) => lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))];

// ---- la verdad, desde la base ----
// La captura con el navegador TAMBIÉN reclamó una entrada: se cuenta aparte
// para que la igualdad compare lo que disparó el arnés.
const { data: ordCaptura } = await svc.from('orders').select('id').eq('event_id', ev.id).eq('buyer_email', `carga-http-${STAMP}-0@test.local`);
const idsCaptura = (ordCaptura ?? []).map((o) => o.id);
const { count: ticketsTotal } = await svc.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', ev.id);
const { count: ticketsCaptura } = idsCaptura.length
  ? await svc.from('tickets').select('id', { count: 'exact', head: true }).in('order_id', idsCaptura)
  : { count: 0 };
const tickets = (ticketsTotal ?? 0) - (ticketsCaptura ?? 0);
const { count: pagadasTotal } = await svc.from('orders').select('id', { count: 'exact', head: true }).eq('event_id', ev.id).eq('status', 'paid');
const pagadas = (pagadasTotal ?? 0) - idsCaptura.length;
const { data: tipo } = await svc.from('ticket_types').select('sold, capacity').eq('id', tt.id).single();
// Duplicados: dos entradas para la misma orden, o dos órdenes pagadas del mismo email.
const dup = await query(`select
  (select count(*) from (select order_id from public.tickets where event_id = '${ev.id}' group by order_id having count(*) > 1) x) as ordenes_con_mas_de_una_entrada,
  (select count(*) from (select lower(buyer_email) e from public.orders where event_id = '${ev.id}' and status = 'paid' group by 1 having count(*) > 1) y) as emails_con_mas_de_una_orden,
  (select count(*) from public.tickets where event_id = '${ev.id}' and qr_code in (select qr_code from public.tickets where event_id = '${ev.id}' group by qr_code having count(*) > 1)) as qr_repetidos`);

log(`\n=== RECLAMO POR HTTP (${dur.toFixed(1)}s, ${(N / dur).toFixed(1)} reclamos/s) ===`);
log(`latencia ms  p50 ${pct(50)} · p95 ${pct(95)} · p99 ${pct(99)} · max ${lat[lat.length - 1]}`);
log(`respuestas: ${JSON.stringify(Object.fromEntries(resultados))}`);
log(`éxitos ${exitos} · órdenes pagadas ${pagadas} · tickets ${tickets} · sold ${tipo.sold}/${tipo.capacity}`);
log(`duplicados: ${JSON.stringify(dup[0])}`);

const { count: enCola } = await svc.from('notification_jobs').select('id', { count: 'exact', head: true }).eq('event_id', ev.id).eq('kind', 'ticket_email');
log(`emails encolados (NO enviados, cron apagado): ${enCola}`);

// ---- limpieza: la cola NO se manda a direcciones inventadas ----
await svc.from('notification_jobs').delete().eq('event_id', ev.id).eq('kind', 'ticket_email');
await svc.from('events').update({ archived_at: new Date().toISOString(), is_published: false }).eq('id', ev.id);
if (estabaArchivada) await svc.from('brands').update({ archived_at: new Date().toISOString() }).eq('id', marca.id);
log('cola de prueba borrada y evento archivado');

const d = dup[0];
const sano = tickets === exitos && pagadas === exitos && Number(d.ordenes_con_mas_de_una_entrada) === 0
  && Number(d.emails_con_mas_de_una_orden) === 0 && Number(d.qr_repetidos) === 0 && !resultados.get('503');
log(sano ? '\n✔ tickets == reclamos exitosos, cero duplicados, cero 503' : '\n❌ revisar: no cuadra');
process.exit(sano ? 0 : 1);
