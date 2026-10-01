// Bloqueo de publicar sin método de pago (2026-10-01), SOLO demotest, sesión
// real del dueño por la UI. Guarda yape_number y saldo; los restaura al final.
//   node e2e/publicar-metodo.mjs
import { chromium } from 'playwright';
import { svc, BASE, log, otpSession, sessionCookies } from './lib.mjs';

const R = [];
const check = (n, ok, d = '') => { R.push(ok); log(`${ok ? '✔' : '✘'} ${n}${d ? ' — ' + d : ''}`); };
const { data: brand } = await svc.from('brands').select('id, slug, yape_number, event_balance, archived_at').eq('slug', 'demotest').single();
if (brand.slug !== 'demotest') throw new Error('solo demotest');
const antes = { yape_number: brand.yape_number, event_balance: brand.event_balance, archived_at: brand.archived_at };
const suf = Date.now().toString(36);
const creados = [];
const crear = async (x, precio) => {
  const { data, error } = await svc.rpc('create_brand_event', {
    p_brand_id: brand.id, p_actor_user_id: null,
    p_event: { slug: `pubmet-${suf}-${x}`, name: `Publicar metodo ${x}`, starts_at: '2027-01-10T02:00:00Z' },
    p_ticket_types: [{ name: 'General', price_cents: precio, capacity: 10, is_unlimited: false, sort_order: 0, phases: [{ price_cents: precio, starts_at: null, ends_at: null, sort_order: 0 }] }],
  });
  if (error) throw new Error('create_brand_event: ' + error.message);
  creados.push(data);
  return data;
};
const publicado = async (id) => (await svc.from('events').select('is_published').eq('id', id).single()).data.is_published;
// La acción tarda (varias consultas a la base): espero hasta 15 s a que quede publicado.
const esperaPublicado = async (id) => { const t = Date.now(); while (Date.now() - t < 15000) { if (await publicado(id)) return Date.now() - t; await new Promise((r) => setTimeout(r, 250)); } return -1; };

const b = await chromium.launch();
try {
  await svc.from('brands').update({ event_balance: antes.event_balance + 4, yape_number: null, archived_at: null }).eq('id', brand.id);
  const pago = await crear('pago', 1000);
  const gratis = await crear('gratis', 0);
  await svc.from('events').update({ is_free: true }).eq('id', gratis);

  const gratisCon = await crear('gratis-con-precio', 1000);
  await svc.from('events').update({ is_free: true, is_published: true }).eq('id', gratisCon);

  const s = await otpSession('brandadmin.demotest@parygo.test');
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies(sessionCookies(s, BASE));
  const p = await ctx.newPage();
  const abrir = async (id) => { await p.goto(`${BASE}/admin/events/${id}`, { waitUntil: 'load' }); };
  const publicar = p.getByRole('button', { name: 'Publicar evento' });

  // (a) cobra y sin método
  await abrir(pago);
  check('(a) aviso "Antes de publicar, elige cómo te pagan"', await p.getByText('Antes de publicar, elige cómo te pagan.').first().isVisible());
  check('(a) enlace "Elegir método de pago" a #cobro', (await p.getByRole('link', { name: 'Elegir método de pago' }).first().getAttribute('href')) === '/admin/settings#cobro');
  check('(a) "Publicar evento" deshabilitado', await publicar.isDisabled());
  // Saltarse el botón apagado: el servidor igual debe rechazar.
  // React ignora el clic por props.disabled (no por el atributo): se lo quito a las props.
  await publicar.evaluate((el) => { el.removeAttribute('disabled'); el[Object.keys(el).find((k) => k.startsWith('__reactProps'))].disabled = false; });
  const resp = p.waitForResponse((r) => r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
  await publicar.click();
  await resp;
  const toast = await p.locator('[data-sonner-toast]').filter({ hasText: 'Antes de publicar, elige cómo te pagan en Mi marca.' }).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  check('(a) el servidor rechaza con el mensaje (falta_metodo)', toast);
  check('(a) queda sin publicar', (await publicado(pago)) === false);

  // (b) mismo evento con método
  await svc.from('brands').update({ yape_number: '987654321' }).eq('id', brand.id);
  await abrir(pago);
  check('(b) sin aviso de método', (await p.getByText('Antes de publicar, elige cómo te pagan.').count()) === 0);
  await publicar.click();
  const msB = await esperaPublicado(pago);
  check('(b) con yape_number publica', msB >= 0, `${msB} ms`);

  // (c) gratis sin método
  await svc.from('brands').update({ yape_number: null }).eq('id', brand.id);
  await abrir(gratis);
  check('(c) evento gratis: sin aviso de método', (await p.getByText('Antes de publicar, elige cómo te pagan.').count()) === 0);
  await publicar.click();
  const msC = await esperaPublicado(gratis);
  check('(c) evento gratis sin yape_number publica', msC >= 0, `${msC} ms`);

  // (d) publicado y gratis, sin método: quitarle "gratis" (con entrada de S/10) lo baja a borrador
  await svc.from('brands').update({ yape_number: null }).eq('id', brand.id);
  await p.goto(`${BASE}/admin/events/${gratisCon}/editar`, { waitUntil: 'load' });
  await p.locator('details:has(input[name="is_free"])').evaluateAll((ds) => ds.forEach((d) => { d.open = true; }));
  await p.locator('input[name="is_free"]').uncheck();
  await p.getByRole('button', { name: 'Guardar datos del evento' }).click();
  const baja = await p.getByText(/Lo pasamos a borrador/).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  check('(d) el mensaje dice "Lo pasamos a borrador"', baja);
  const { data: evd } = await svc.from('events').select('is_free, is_published').eq('id', gratisCon).single();
  check('(d) el cambio se guardó (is_free=false) y el evento volvió a borrador', evd.is_free === false && evd.is_published === false, JSON.stringify(evd));

  // (e) con un evento pago publicado, Mi marca no deja vaciar el número
  await svc.from('brands').update({ yape_number: '987654321' }).eq('id', brand.id);
  check('(e) precondición: evento pago sigue publicado', (await publicado(pago)) === true);
  await p.goto(`${BASE}/admin/settings`, { waitUntil: 'load' });
  await p.locator('#yape_number').fill('');
  await p.getByRole('button', { name: 'Guardar configuración' }).click();
  const rech = await p.getByText(/no puedes quitar tu método de pago/).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  check('(e) vaciar el número con eventos que cobran: rechazado con mensaje', rech);
  const { data: bn } = await svc.from('brands').select('yape_number').eq('id', brand.id).single();
  check('(e) el número sigue guardado', bn.yape_number === '987654321', String(bn.yape_number));
} catch (e) {
  check('excepción', false, e.message);
} finally {
  await b.close();
  for (const id of creados) {
    await svc.from('events').update({ is_published: false }).eq('id', id);
    const { error } = await svc.from('events').delete().eq('id', id);
    if (error) log(`no se pudo borrar ${id}: ${error.message} (queda despublicado)`);
  }
  await svc.from('brands').update(antes).eq('id', brand.id);
  log(`restaurado: yape_number ${antes.yape_number ? 'original' : 'null'}, saldo ${antes.event_balance}`);
}
const ok = R.filter(Boolean).length;
console.log(`\n${ok === R.length ? '✅' : '❌'} publicar-metodo ${ok}/${R.length}`);
process.exit(ok === R.length ? 0 : 1);
