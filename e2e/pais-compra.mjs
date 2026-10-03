// Compra punta a punta en COP + Nequi (AGENTS.md tarea 5). Marca TEMPORAL is_test
// (demotest no se toca: tiene eventos y su moneda ya no cambia). Se borra al final.
// Dueña de la marca = usuario temporal (brandadmin.demotest ya es dueño de
// demotest y brand_members_un_dueno impide una segunda marca), con sesión REAL:
// el cambio de medio y la aprobación van por la UI del panel, no con service role.
//
// Requiere el server local en BASE (ver .claude/agents/e2e-parygo.md):
//   node e2e/pais-compra.mjs
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { svc, env, BASE, OUT, log, sleep, otpSession, sessionCookies } from './lib.mjs';

const STAMP = Date.now().toString(36);
const SLUG = `e2e-co-${STAMP}`;
const EVENT_SLUG = `fiesta-${STAMP}`;
const OWNER = `e2e-co-${STAMP}@parygo.test`;
const BUYER = `delivered+e2e-co-${STAMP}@resend.dev`; // buzón de pruebas de Resend
const CUENTA = '3001234567';
const R = [];
const check = (n, ok, d = '') => { R.push(!!ok); log(`${ok ? '✅' : '❌'} ${n}${d ? ' · ' + String(d).slice(0, 220) : ''}`); };
const norm = (s) => String(s).replace(/\s+/g, ' ');

let brandId = null, ownerId = null, eventId = null, browser = null;
try {
  // ---------- datos temporales ----------
  const b = await svc.from('brands').insert({
    slug: SLUG, name: `E2E Colombia ${STAMP}`, is_test: true, archived_at: null, event_balance: 1,
    moneda: 'COP', zona_horaria: 'America/Bogota', metodo_manual: 'nequi', yape_number: CUENTA, yape_holder: 'Prueba E2E',
  }).select('id').single();
  if (b.error) throw new Error('marca: ' + b.error.message);
  brandId = b.data.id;
  const u = await svc.auth.admin.createUser({ email: OWNER, email_confirm: true });
  if (u.error) throw new Error('usuario: ' + u.error.message);
  ownerId = u.data.user.id;
  const m = await svc.from('brand_members').insert({ brand_id: brandId, user_id: ownerId, role: 'brand_admin', display_name: OWNER });
  if (m.error) throw new Error('membresía: ' + m.error.message);

  const PRECIO = 5000000; // COP 50.000 (centavos ×100, también en COP)
  const ev = await svc.rpc('create_brand_event', {
    p_brand_id: brandId, p_actor_user_id: null,
    p_event: { slug: EVENT_SLUG, name: `Fiesta E2E ${STAMP}`, starts_at: new Date(Date.now() + 20 * 864e5).toISOString(), ends_at: new Date(Date.now() + 20 * 864e5 + 6 * 36e5).toISOString(), venue_name: 'Local E2E', moneda: 'COP' },
    p_ticket_types: [{ name: 'General', price_cents: PRECIO, capacity: 5, is_unlimited: false, sort_order: 0, phases: [{ price_cents: PRECIO, starts_at: null, ends_at: null, sort_order: 0 }] }],
  });
  if (ev.error) throw new Error('evento: ' + ev.error.message);
  eventId = ev.data;
  const pub = await svc.from('events').update({ is_published: true }).eq('id', eventId);
  if (pub.error) throw new Error('publicar: ' + pub.error.message);
  const { data: tt } = await svc.from('ticket_types').select('id, price_cents').eq('event_id', eventId).single();
  check('evento COP creado con una entrada de 5.000.000 centavos', tt?.price_cents === PRECIO, JSON.stringify(tt));

  // Comprobante sintético.
  const PROOF = resolve(OUT, 'pais-compra-proof.png');
  browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] });
  {
    const pg = await browser.newPage({ viewport: { width: 380, height: 300 } });
    await pg.setContent(`<body style="margin:0;font-family:sans-serif"><div style="background:#200020;color:#fff;padding:24px;text-align:center"><b style="font-size:22px">Nequi</b><div style="font-size:30px;font-weight:800">$ 50.000</div></div><p style="padding:16px">Comprobante DUMMY E2E ${STAMP}</p></body>`);
    await pg.screenshot({ path: PROOF });
    await pg.close();
  }

  // ---------- comprador (390) ----------
  const bctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', timezoneId: 'America/Bogota', extraHTTPHeaders: { 'x-parygo-brand-slug': SLUG } });
  const p = await bctx.newPage();
  const vis = (loc) => loc.filter({ visible: true }).first();
  await p.goto(`${BASE}/${EVENT_SLUG}`, { waitUntil: 'load', timeout: 90000 });
  await p.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  let txt = norm(await p.locator('body').innerText());
  check('precio en pesos: "$ 50.000" y ningún "S/"', /\$\s?50\.000/.test(txt) && !/S\//.test(txt), txt.slice(0, 160));

  await vis(p.getByRole('button', { name: 'Sumar General' })).click();
  await sleep(1500); // reserva del carrito (debounce 400 ms + server action)
  const cta = vis(p.locator('.b-cta .b-btn--go, .b-sum .b-btn--go'));
  await cta.click();
  await p.locator('#buyer_name').waitFor({ timeout: 15000 });
  await p.fill('#buyer_name', `Comprador Co ${STAMP}`);
  await p.fill('#buyer_email', BUYER);
  await p.fill('#buyer_phone', '+57 300 111 2233');
  if (await p.locator('#buyer_dni').count()) await p.fill('#buyer_dni', '12345678');
  if (await p.locator('input[name="age_ok"]').count()) await p.check('input[name="age_ok"]');
  txt = norm(await p.locator('body').innerText());
  check('el medio dice Nequi y no "Yape"', /Nequi/.test(txt) && !/yape/i.test(txt), txt.slice(0, 200));
  check('no hay opción Tarjeta (COP)', (await p.getByRole('radio', { name: 'Tarjeta' }).count()) === 0 && !/tarjeta/i.test(txt));

  const ckP = p.waitForRequest((q) => q.method() === 'POST' && !!q.headers()['next-action'] && (q.postData() || '').includes('"buyerEmail"'), { timeout: 30000 }).catch(() => null);
  await vis(p.locator('button[type=submit][form="checkout-form"]')).click();
  await p.waitForURL(/\/yape\?order=/, { timeout: 30000 });
  const ck = await ckP;
  const orderId = new URL(p.url()).searchParams.get('order');
  await p.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  txt = norm(await p.locator('body').innerText());
  check('/yape: Nequi, cuenta 3001234567 y monto "$ 50.000"', /Nequi/.test(txt) && txt.includes(CUENTA) && /\$\s?50\.000/.test(txt), txt.slice(0, 260));
  check('/yape: sin "yape(a)", ni "S/"', !/yape/i.test(txt.replace(/\/yape/g, '')) && !/S\//.test(txt), txt.match(/.{20}(yape|S\/).{20}/i)?.[0]);

  // ---------- comprobante con "50.000" ----------
  await p.fill('#amount', '50.000');
  await p.fill('#operation_number', `${Date.now()}`.slice(-9));
  await p.fill('#payer_name', `Comprador Co ${STAMP}`);
  await p.locator('#receipt').setInputFiles(PROOF);
  await sleep(400);
  await p.getByRole('button', { name: /Listo, ya pagué/i }).click();
  await p.waitForURL(/\/confirmacion\?order=/, { timeout: 45000 });

  // ---------- base ----------
  const { data: o } = await svc.from('orders').select('status, payment_method, total_cents').eq('id', orderId).single();
  check('orden pending_yape_review / yape_manual / 5.000.000', o?.status === 'pending_yape_review' && o?.payment_method === 'yape_manual' && o?.total_cents === PRECIO, JSON.stringify(o));
  const { data: pf } = await svc.from('yape_proofs').select('amount_cents').eq('order_id', orderId);
  check('comprobante "50.000" leído como 5.000.000 centavos (no 5.000)', pf?.length === 1 && pf[0].amount_cents === PRECIO, JSON.stringify(pf));

  // ---------- Tarjeta rechazada aunque se llame a la acción ----------
  if (ck) {
    const base = JSON.parse(ck.postData())[0];
    const keep = ['next-action', 'next-router-state-tree', 'content-type', 'accept', 'x-parygo-brand-slug'];
    const headers = Object.fromEntries(Object.entries(ck.headers()).filter(([k]) => keep.includes(k)));
    const resp = await p.request.post(ck.url(), { headers, data: JSON.stringify([{ ...base, method: 'mercadopago', buyerEmail: `delivered+e2e-co-mp-${STAMP}@resend.dev` }]) });
    const body = await resp.text();
    const { data: mp } = await svc.from('orders').select('id').eq('event_id', eventId).eq('payment_method', 'mercadopago');
    const { data: todas } = await svc.from('orders').select('id').eq('event_id', eventId);
    check('Tarjeta forjada en COP: rechazada y 0 órdenes de mercadopago (solo queda la de Nequi)', (mp ?? []).length === 0 && (todas ?? []).length === 1, `${resp.status()} · ${body.slice(-140)}`);
  } else log('⏭  Tarjeta forjada: no se capturó el request del checkout, se salta');

  // ---------- panel del dueño (sesión real) ----------
  const octx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await octx.addCookies(sessionCookies(await otpSession(OWNER)));
  const a = await octx.newPage();
  const dialogos = [];
  a.on('dialog', (d) => { dialogos.push(d.message()); d.accept().catch(() => {}); }); // confirm() de "Aprobar"

  // Medio bloqueado con un pago por aprobar.
  await a.goto(`${BASE}/admin/settings`, { waitUntil: 'load', timeout: 90000 });
  await a.locator('#metodo_manual').selectOption('transferencia');
  await a.fill('#yape_number', 'Bancolombia ahorros 123456789');
  await a.fill('#yape_holder', 'Prueba E2E');
  await a.getByRole('button', { name: /Guardar configuración/ }).click();
  const bloq = await a.getByText(/pagos por aprobar/i).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  const { data: br } = await svc.from('brands').select('metodo_manual, yape_number').eq('id', brandId).single();
  check('cambiar el medio con un pago por aprobar: rechazado y la marca sigue en Nequi', bloq && br?.metodo_manual === 'nequi' && br?.yape_number === CUENTA, JSON.stringify(br));

  // Aprobación por la UI del panel.
  await a.goto(`${BASE}/admin/events/${eventId}/yape`, { waitUntil: 'load', timeout: 90000 });
  const toggles = a.locator('.a-yrow__toggle');
  for (let i = 0, n = await toggles.count(); i < n; i++) await toggles.nth(i).click();
  const row = a.locator('.a-yrow').filter({ hasText: BUYER }).last();
  await row.waitFor({ timeout: 20000 });
  check('el panel muestra el pago en pesos ("$ 50.000")', /\$\s?50\.000/.test(norm(await row.innerText())), norm(await row.innerText()).slice(0, 160));
  await row.getByRole('button', { name: /^Aprobar$/ }).click();
  let paid = null;
  for (let i = 0; i < 40; i++) { paid = (await svc.from('orders').select('status, email_sent_at').eq('id', orderId).single()).data; if (paid?.status === 'paid') break; await sleep(500); }
  const { data: tks } = await svc.from('tickets').select('id').eq('order_id', orderId);
  check('aprobada: orden paid y 1 entrada emitida', paid?.status === 'paid' && tks?.length === 1, `${paid?.status} · tickets=${tks?.length}`);
  check('el aviso de aprobar habla en pesos', dialogos.some((d) => /\$\s?50\.000/.test(norm(d))), dialogos.join(' | '));
  // Sin RESEND_API_KEY en el server local el correo no sale: se salta (no se cuenta).
  if (!env.RESEND_API_KEY) log('⏭  correo de la entrada: el server local no tiene RESEND_API_KEY, se salta');
  else {
    for (let i = 0; i < 20 && !paid?.email_sent_at; i++) { await sleep(500); paid = (await svc.from('orders').select('status, email_sent_at').eq('id', orderId).single()).data; }
    check('correo de la entrada enviado (email_sent_at)', !!paid?.email_sent_at);
  }
  // ponytail: el cuerpo del correo en COP no se lee (Resend no devuelve el HTML al test); lo cubre el render de la plantilla.
} catch (e) {
  check('excepción', false, String(e.message).split('\n')[0]);
} finally {
  // ---------- limpieza (todo es RESTRICT: de hijas a padres) ----------
  const del = async (t, col, v) => { const r = await svc.from(t).delete().eq(col, v); if (r.error && !/column|relation|does not exist|schema cache/i.test(r.error.message)) log(`limpieza ${t}.${col}: ${r.error.message}`); };
  try {
    if (browser) await browser.close().catch(() => {});
    if (eventId) {
      const { data: ords } = await svc.from('orders').select('id').eq('event_id', eventId);
      for (const { id } of ords ?? []) {
        const { data: files } = await svc.storage.from('yape-proofs').list(`${brandId}/${id}`);
        if (files?.length) await svc.storage.from('yape-proofs').remove(files.map((f) => `${brandId}/${id}/${f.name}`));
        for (const t of ['tickets', 'yape_proofs', 'promo_redemptions', 'events_log', 'stock_reservations', 'order_items', 'notification_jobs']) await del(t, 'order_id', id);
        await del('orders', 'id', id);
      }
      for (const t of ['tickets', 'events_log', 'stock_reservations']) await del(t, 'event_id', eventId);
      const { data: tts } = await svc.from('ticket_types').select('id').eq('event_id', eventId);
      for (const { id } of tts ?? []) { await del('ticket_type_price_phases', 'ticket_type_id', id); await del('ticket_types', 'id', id); }
      await del('events', 'id', eventId);
    }
    if (brandId) {
      await del('brand_members', 'brand_id', brandId);
      await del('events_log', 'brand_id', brandId);
      await del('brands', 'id', brandId);
    }
    if (ownerId) await svc.auth.admin.deleteUser(ownerId);
  } catch (e) { log('limpieza falló: ' + e.message); }
  if (brandId) {
    const { data: resto } = await svc.from('brands').select('id').eq('id', brandId);
    const { data: demo } = await svc.from('brands').select('moneda, metodo_manual').eq('slug', 'demotest').single();
    check('limpieza: marca temporal borrada y demotest sigue en PEN + yape', !(resto ?? []).length && demo?.moneda === 'PEN' && demo?.metodo_manual === 'yape', `resto=${(resto ?? []).length}`);
  }
}

const fallas = R.filter((x) => !x).length;
log(`${R.length - fallas}/${R.length} OK`);
process.exit(fallas ? 1 : 0);
