// Email REAL de la entrada, en PRODUCCIÓN, sobre DEMOTEST. Una sola vez, a
// pedido de Paul (2026-09-23), para verificar el email del tema noche con
// Resend de verdad: 2 QR inline, 2 PNG adjuntos, el botón, sin código ni URL.
//
// Fases (se corren por separado, en orden):
//   node e2e/prod-email-noche.mjs preparar   desarchiva demotest y crea un evento
//                                             GRATIS e2e-email-noche-* (flyer 4:5
//                                             sintético de corridas anteriores)
//   node e2e/prod-email-noche.mjs reclamar   reclama 2 entradas por la UI de
//                                             demotest.parygo.com con el correo de Paul
//   node e2e/prod-email-noche.mjs verificar  estado de la orden, la cola de email
//                                             y el correo armado (mismo render)
//   node e2e/prod-email-noche.mjs anular     anula esas 2 entradas (misma escritura
//                                             que voidTicketAction) — después:
//                                             node e2e/cleanup.mjs
//
// SOLO demotest. Decenas de filas como máximo, nunca volumen.
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { svc, log } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'tmp', 'prod-noche');
mkdirSync(OUT, { recursive: true });
const ESTADO = resolve(OUT, 'estado.json');
const est = existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, 'utf8')) : {};
const guardar = () => writeFileSync(ESTADO, JSON.stringify(est, null, 2));
const CORREO = 'paulsebastian439@gmail.com';

const { data: marca } = await svc.from('brands').select('id, slug').eq('slug', 'demotest').single();
if (marca?.slug !== 'demotest') throw new Error('solo demotest');
const fase = process.argv[2];

if (fase === 'preparar') {
  await svc.from('brands').update({ archived_at: null }).eq('id', marca.id);
  // El flyer 4:5 sintético que ya subió el E2E (bucket de demotest).
  const { data: conFlyer } = await svc.from('events').select('cover_url, cover_w, cover_h')
    .eq('brand_id', marca.id).eq('cover_w', 1080).eq('cover_h', 1350).not('cover_url', 'is', null)
    .order('created_at', { ascending: false }).limit(1);
  const { data: alto } = await svc.from('events').select('cover_url')
    .eq('brand_id', marca.id).eq('cover_h', 2400).not('cover_url', 'is', null)
    .order('created_at', { ascending: false }).limit(1);
  const stamp = String(Date.now()).slice(-6);
  const inicio = new Date(Date.now() + 10 * 86400000);
  const { data: ev, error } = await svc.from('events').insert({
    brand_id: marca.id, slug: `e2e-email-noche-${stamp}`, name: `Noche Email ${stamp}`,
    starts_at: inicio.toISOString(), ends_at: new Date(inicio.getTime() + 6 * 3600000).toISOString(),
    venue_name: 'Local E2E', venue_address: 'Av. Test 123, Lima', is_published: true, is_free: true, min_age: 0,
    cover_url: conFlyer?.[0]?.cover_url ?? null, cover_w: 1080, cover_h: 1350,
  }).select('id, slug').single();
  if (error) throw new Error(error.message);
  const { error: e2 } = await svc.from('ticket_types').insert({
    event_id: ev.id, name: 'Entrada', price_cents: 0, capacity: 5,
    is_active: true, is_unlimited: false, is_courtesy: false, max_scans: 1, sort_order: 1,
  });
  if (e2) throw new Error(e2.message);
  Object.assign(est, { eventId: ev.id, slug: ev.slug, flyer45: conFlyer?.[0]?.cover_url ?? null, flyerAlto: alto?.[0]?.cover_url ?? null });
  guardar();
  log(`evento gratis ${ev.slug} (flyer ${est.flyer45 ? 'sí' : 'NO'})`);
} else if (fase === 'reclamar') {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`https://demotest.parygo.com/${est.slug}`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Sumar Entrada' }).filter({ visible: true }).first().click();
  await p.waitForTimeout(1200);
  const cant = (await p.locator('.b-qval').filter({ visible: true }).first().innerText()).trim();
  if (cant !== '2') throw new Error(`cantidad ${cant}, se esperaban 2`);
  await p.locator('.b-sum .b-btn--go').click();
  await p.locator('#buyer_name').waitFor({ timeout: 20000 });
  await p.fill('#buyer_name', 'Paul Prueba Noche');
  await p.fill('#buyer_email', CORREO);
  await p.fill('#buyer_phone', '+51 999 111 222');
  if (await p.locator('#buyer_dni').count()) await p.fill('#buyer_dni', '12345678');
  await p.locator('button[type=submit][form="checkout-form"]').filter({ visible: true }).first().click();
  await p.waitForURL(/\/confirmacion\?order=/, { timeout: 45000 });
  await p.waitForTimeout(2000);
  est.orderId = new URL(p.url()).searchParams.get('order');
  await p.screenshot({ path: resolve(OUT, 'confirmacion-1440.png'), fullPage: true });
  guardar();
  await b.close();
  log(`orden ${est.orderId}`);
} else if (fase === 'verificar') {
  const { data: o } = await svc.from('orders').select('id, brand_id, status, buyer_email, email_sent_at, tickets(id, ticket_number, invalidated_at)').eq('id', est.orderId).single();
  if (o.brand_id !== marca.id) throw new Error('la orden no es de demotest');
  const { data: cola } = await svc.from('notification_jobs').select('*').eq('order_id', est.orderId).limit(5);
  const { data: logs } = await svc.from('events_log').select('type, payload, created_at').eq('order_id', est.orderId).order('created_at');
  console.log(JSON.stringify({ status: o.status, para: o.buyer_email, entradas: o.tickets.length, email_sent_at: o.email_sent_at, cola, logs }, null, 1));
  const out = execFileSync('npx', ['tsx', '../../e2e/email-entrada.mts', est.orderId, JSON.stringify(resolve(OUT, 'email-prod.html'))], { cwd: resolve(ROOT, 'apps', 'web'), encoding: 'utf8', shell: true });
  const c = JSON.parse(out.trim().split('\n').pop());
  const codigos = c.tickets.flatMap((t) => [t.ticket_number, t.qr_code]).filter((x) => (c.visible + c.text).includes(x));
  console.log(JSON.stringify({ cids: c.cids, adjuntos: c.attachments, boton: /Ver mis? entradas?/.test(c.visible), codigosVisibles: codigos, urlVisible: /https?:\/\//.test(c.visible + c.text) }, null, 1));
} else if (fase === 'anular') {
  const { data: o } = await svc.from('orders').select('id, brand_id, event_id, tickets(id, ticket_number, invalidated_at)').eq('id', est.orderId).single();
  if (o.brand_id !== marca.id) throw new Error('la orden no es de demotest');
  for (const t of o.tickets) {
    if (t.invalidated_at) continue;
    await svc.from('tickets').update({ invalidated_at: new Date().toISOString() }).eq('id', t.id).eq('brand_id', marca.id).is('invalidated_at', null);
    await svc.from('events_log').insert({ brand_id: marca.id, event_id: o.event_id, ticket_id: t.id, order_id: o.id, type: 'ticket_voided', payload: { ticket_number: t.ticket_number, reason: 'Prueba de email del tema noche (design/noche)' } });
  }
  const { data: tk } = await svc.from('tickets').select('id, invalidated_at').eq('order_id', est.orderId);
  log(`anuladas: ${tk.filter((t) => t.invalidated_at).length}/${tk.length}`);
} else {
  throw new Error('fase: preparar | reclamar | verificar | anular');
}
