// Precio sin fase activa (0077): lo que MUESTRA la página (armarEscalera) =
// lo que COBRA (get_event_active_prices, el RPC de startCheckout). SOLO demotest.
// Arma 1 evento publicado con 4 tipos (pocas filas) y lo borra al final.
//   node e2e/precio-sin-fase.mjs
import { chromium } from 'playwright';
import { svc, anon, BASE, log } from './lib.mjs';

const R = [];
const check = (n, ok, d = '') => { R.push(!!ok); log(`${ok ? '✔' : '✘'} ${n}${d ? ' — ' + d : ''}`); };
const D = 86400000;
const iso = (dias) => new Date(Date.now() + dias * D).toISOString();
const STAMP = String(Date.now()).slice(-6);

// base = 1000 en todos (el más barato): si cae al base, lo detectamos.
const CASOS = [
  { name: 'A todas terminadas', esperado: 15000, fases: [[-30, -20, 10000], [-20, -10, 15000]] },
  { name: 'B todas futuras',    esperado: 20000, fases: [[2, 3, 25000], [1, 2, 20000]] },
  { name: 'C hueco entre fases', esperado: 40000, fases: [[-10, -5, 30000], [5, 10, 40000]] },
  { name: 'D control vigente',  esperado: 70000, fases: [[-1, 1, 70000], [1, 2, 80000]] },
];

const { data: marca } = await svc.from('brands').select('id').eq('slug', 'demotest').single();
if (!marca) throw new Error('demotest no encontrada');
let evId = null;
let b;
try {
  const inicio = new Date(Date.now() + 30 * D);
  const slug = `e2e-sinfase-${STAMP}`;
  const { data: ev, error } = await svc.from('events').insert({
    brand_id: marca.id, slug, name: `E2E Sin fase ${STAMP}`, starts_at: inicio.toISOString(),
    ends_at: new Date(inicio.getTime() + 7 * 3600000).toISOString(),
    venue_name: 'Local E2E', is_published: true, is_free: false, min_age: 0,
  }).select('id').single();
  if (error) throw new Error('evento: ' + error.message);
  evId = ev.id;
  const ids = [];
  for (const [i, c] of CASOS.entries()) {
    const { data: tt, error: e1 } = await svc.from('ticket_types').insert({
      event_id: evId, name: c.name, price_cents: 1000, capacity: 50, is_active: true,
      is_unlimited: false, is_courtesy: false, max_scans: 1, sort_order: i + 1,
    }).select('id').single();
    if (e1) throw new Error('tipo ' + c.name + ': ' + e1.message);
    ids.push(tt.id);
    for (const [j, [d0, d1, px]] of c.fases.entries()) {
      const { error: e2 } = await svc.from('ticket_type_price_phases').insert({
        ticket_type_id: tt.id, name: `F${j + 1}`, price_cents: px, starts_at: iso(d0), ends_at: iso(d1), sort_order: j + 1,
      });
      if (e2) throw new Error('fase: ' + e2.message);
    }
  }

  // COBRA: el RPC que usa startCheckout (service role) y el que usa la página (anon).
  const { data: cobra, error: eC } = await svc.rpc('get_event_active_prices', { p_event_id: evId });
  const { data: muestraRpc } = await anon().rpc('get_event_active_prices', { p_event_id: evId });
  if (eC) throw new Error('rpc: ' + eC.message);
  CASOS.forEach((c, i) => {
    const f = cobra.find((r) => r.ticket_type_id === ids[i]);
    check(`COBRA ${c.name}: ${c.esperado}`, f?.active_price_cents === c.esperado, `rpc=${f?.active_price_cents}`);
    check(`anon ve lo mismo — ${c.name}`, muestraRpc?.find((r) => r.ticket_type_id === ids[i])?.active_price_cents === c.esperado);
  });

  // MUESTRA: precio grande de cada fila en la página pública.
  b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.goto(`${BASE}/b/demotest/${slug}`, { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('.b-ph__pr, .b1-ty__pr', { timeout: 30000 });
  const grandes = await p.$$eval('.b-ph__pr, .b1-ty__pr', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  log('precios grandes en página: ' + JSON.stringify(grandes));
  const num = (s) => Number(s.replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  CASOS.forEach((c, i) => {
    const mostrado = grandes[i] != null ? Math.round(num(grandes[i]) * 100) : null;
    check(`MUESTRA ${c.name} = lo que cobra (${c.esperado / 100})`, mostrado === c.esperado, `página="${grandes[i]}"`);
  });
  check('una fila por tipo', grandes.length === CASOS.length, `filas=${grandes.length}`);
} catch (e) {
  check('excepción', false, e.message);
} finally {
  await b?.close();
  if (evId) {
    const { data: tts } = await svc.from('ticket_types').select('id').eq('event_id', evId);
    const tid = (tts ?? []).map((t) => t.id);
    if (tid.length) await svc.from('ticket_type_price_phases').delete().in('ticket_type_id', tid);
    await svc.from('ticket_types').delete().eq('event_id', evId);
    const { error } = await svc.from('events').delete().eq('id', evId);
    log(error ? 'LIMPIEZA falló: ' + error.message : 'evento de prueba borrado');
  }
}
const ok = R.filter(Boolean).length;
log(`${ok === R.length ? '✅' : '❌'} ${ok}/${R.length}`);
process.exit(ok === R.length ? 0 : 1);
