// Evento privado (0075): lo que el security review pidió probar con la
// pasarela de verdad (2026-09-28). Corre contra PRODUCCIÓN con PayPal en
// dólares: crea órdenes que NUNCA se aprueban (no se cobra nada; PayPal las
// vence sola) y al final todo queda archivado, is_test y en 'failed'.
//   1. Mismo correo y mismo enlace, "privado" y después "marca": el segundo
//      da "enlace ocupado" (una marca pendiente se reusa SOLO si es del mismo
//      tipo: brands.tipo no cambia nunca).
//   2. Lo mismo pero las dos pestañas A LA VEZ: una sola marca, una sola
//      compra, y el monto acorde a SU tipo.
//   3. Una marca privada (demotest, prestada y devuelta) manipula el panel
//      para comprar el paquete de 3: el server lo rechaza y no crea compra.
//
//   E2E_BASE=https://app.parygo.com node e2e/privado-pagos.mjs
import { chromium } from 'playwright';
import { svc, BASE, log, otpSession, sessionCookies } from './lib.mjs';

const DEMO = '08553a34-988f-4537-b816-43e385b5a7a4';
const STAMP = Date.now().toString().slice(-7);
const R = [];
const check = (nombre, ok, detalle = '') => { R.push(ok); log(`${ok ? '✔' : '✘'} ${nombre}${detalle ? ' — ' + detalle : ''}`); };
const marcasCreadas = new Set();

// Recorre el alta en inglés (dólares → PayPal) hasta el botón de pagar.
async function hastaPagar(ctx, { tipo, slug, email }) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/empezar?tipo=${tipo}&lang=en`, { waitUntil: 'networkidle' });
  const seguir = () => p.getByRole('button', { name: /^Continue/ }).click();
  if (tipo === 'marca') await p.locator('.ez-plan:has(input[value="1"])').click();
  await seguir();
  await p.fill('#ez-nombre', `E2E ${tipo} ${STAMP}`);
  await seguir();
  await p.fill('#ez-slug', slug);
  await p.locator('#e-slug').filter({ hasText: /Available|already|in use/ }).waitFor({ timeout: 10000 }).catch(() => {});
  await seguir();
  // Si el enlace ya es de otra marca, el chequeo en vivo NO deja pasar de
  // este paso (antes de que el server lo vea): se devuelve 'bloqueado'.
  const llega = await p.locator('#ez-email').waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
  if (!llega) return { p, bloqueado: /already belongs|in use/i.test(await p.locator('main').innerText()) };
  await p.fill('#ez-email', email);
  await seguir();
  await p.fill('#ez-pass', 'E2eAlta!2026');
  return { p, bloqueado: false };
}
const pagar = (p) => p.getByRole('button', { name: /^Pay / }).click();
async function resultado(p) {
  const fue = await p.waitForURL(/paypal\.com/, { timeout: 30000, waitUntil: 'commit' }).then(() => 'paypal').catch(() => null);
  if (fue) return 'paypal';
  const txt = await p.locator('main').innerText().catch(() => '');
  return /already|in use|belongs/i.test(txt) ? 'ocupado' : `otro: ${txt.replace(/\s+/g, ' ').slice(0, 80)}`;
}
async function estado(slug) {
  const { data: bs } = await svc.from('brands').select('id, tipo').eq('slug', slug);
  for (const b of bs ?? []) marcasCreadas.add(b.id);
  const ids = (bs ?? []).map((b) => b.id);
  const { data: cs } = ids.length ? await svc.from('pack_purchases').select('amount_cents, currency, brand_id').in('brand_id', ids) : { data: [] };
  return { marcas: bs ?? [], compras: cs ?? [] };
}

const b = await chromium.launch();
const { data: demoAntes } = await svc.from('brands').select('tipo').eq('id', DEMO).single();
try {
  // ---------- 1. Uno detrás del otro ----------
  {
    const slug = `e2e-pp-seq${STAMP}`;
    const email = `delivered+pp-seq${STAMP}@resend.dev`;
    const c1 = await b.newContext();
    const h1 = await hastaPagar(c1, { tipo: 'privado', slug, email });
    await pagar(h1.p);
    const r1 = await resultado(h1.p);
    const c2 = await b.newContext();
    const h2 = await hastaPagar(c2, { tipo: 'marca', slug, email });
    const r2 = h2.bloqueado ? 'ocupado' : await (async () => { await pagar(h2.p); return resultado(h2.p); })();
    const e = await estado(slug);
    check('1. privado y después marca con el mismo enlace: el segundo queda frenado ("enlace ocupado")', r1 === 'paypal' && r2 === 'ocupado', `${r1} / ${r2}`);
    check('1. queda UNA marca privada con UNA compra de US$19', e.marcas.length === 1 && e.marcas[0].tipo === 'privado' && e.compras.length === 1 && e.compras[0].amount_cents === 1900 && e.compras[0].currency === 'USD', JSON.stringify(e));
    await c1.close(); await c2.close();
  }

  // ---------- 2. Las dos pestañas A LA VEZ ----------
  {
    const slug = `e2e-pp-par${STAMP}`;
    const email = `delivered+pp-par${STAMP}@resend.dev`;
    const [ca, cb] = [await b.newContext(), await b.newContext()];
    const [ha, hb] = await Promise.all([hastaPagar(ca, { tipo: 'privado', slug, email }), hastaPagar(cb, { tipo: 'marca', slug, email })]);
    const [pa, pb] = [ha.p, hb.p];
    check('2. las dos pestañas llegan a "Pagar" (el enlace estaba libre para ambas)', !ha.bloqueado && !hb.bloqueado);
    await Promise.all([pagar(pa), pagar(pb)]);
    const [ra, rb] = await Promise.all([resultado(pa), resultado(pb)]);
    const e = await estado(slug);
    const esperado = e.marcas[0]?.tipo === 'privado' ? 1900 : 5900;
    check('2. a la vez: una va a PayPal y la otra da "enlace ocupado"', [ra, rb].sort().join('/') === 'ocupado/paypal', `privado=${ra} marca=${rb}`);
    check('2. a la vez: UNA marca, UNA compra, con el monto de SU tipo', e.marcas.length === 1 && e.compras.length === 1 && e.compras[0].amount_cents === esperado, JSON.stringify(e));
    await ca.close(); await cb.close();
  }

  // ---------- 3. Marca privada manipula el panel para comprar 3 ----------
  {
    await svc.from('brands').update({ tipo: 'privado' }).eq('id', DEMO);
    const desde = new Date().toISOString();
    const s = await otpSession('brandadmin.demotest@parygo.test');
    const ctx = await b.newContext();
    await ctx.addCookies(sessionCookies(s, BASE));
    const p = await ctx.newPage();
    await p.goto(`${BASE}/admin/comprar`, { waitUntil: 'networkidle' });
    const txt = await p.locator('body').innerText();
    const filas = await p.locator('form input[name="pack"]').count();
    check('3. la marca privada ve un solo producto: "1 evento privado"', filas === 1 && /1 evento privado/.test(txt), `filas=${filas}`);
    // Manipula el formulario: pide el paquete de 3.
    await p.locator('form input[name="pack"]').first().evaluate((el) => { el.value = '3'; });
    await p.getByRole('button', { name: /PayPal/ }).first().click();
    await p.getByText(/se compra de a uno/i).waitFor({ timeout: 20000 }).catch(() => {});
    const msg = /se compra de a uno/i.test(await p.locator('body').innerText());
    const { count } = await svc.from('pack_purchases').select('id', { count: 'exact', head: true }).eq('brand_id', DEMO).gte('created_at', desde);
    check('3. pack=3 manipulado: el server lo rechaza y no crea ninguna compra', msg && count === 0 && !/paypal\.com/.test(p.url()), `mensaje=${msg} compras=${count}`);
    await ctx.close();
  }
} catch (e) {
  check('excepción', false, e.message);
} finally {
  await b.close();
  await svc.from('brands').update({ tipo: demoAntes?.tipo ?? 'marca' }).eq('id', DEMO);
  for (const id of marcasCreadas) {
    await svc.from('pack_purchases').update({ status: 'failed' }).eq('brand_id', id).eq('status', 'pending');
    await svc.from('brands').update({ is_test: true, archived_at: new Date().toISOString() }).eq('id', id);
  }
  const { data: d } = await svc.from('brands').select('tipo').eq('id', DEMO).single();
  log(`limpieza: ${marcasCreadas.size} marca(s) archivada(s) is_test, compras failed; demotest tipo=${d?.tipo}`);
}
const ok = R.filter(Boolean).length;
log(`${ok === R.length ? '✅' : '❌'} ${ok}/${R.length}`);
process.exit(ok === R.length ? 0 : 1);
