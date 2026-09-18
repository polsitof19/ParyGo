// E2E Fase 1 (A→K) contra el dev local de apps/web (Supabase = PROD).
// Límites: SOLO la marca demotest; nunca Code/Almighty. Sin migraciones.
// Uso: ver e2e/README.md (server local de apps/web en :3001)
// Capturas + results.json en tmp/e2e/.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import {
  OUT, BASE, BRAND, FORBIDDEN_SLUGS, env, svc, anon, log, sleep, otpSession, sessionCookies,
  limaLocal, saveJson, toasts, bodyText,
} from './lib.mjs';

const STAMP = String(Date.now()).slice(-6);
const EVENT_SLUG = `e2e-sep-${STAMP}`;
const PAST_SLUG = `e2e-pasado-${STAMP}`;
const PROMO = `E2E20${STAMP.slice(-3)}`;
const ADMIN_EMAIL = 'brandadmin.demotest@parygo.test';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'E2eSep!demotest2026'; // la setea el paso A
const VALIDATOR_EMAIL = 'validator.demotest@parygo.test';
const SUPER_EMAIL = env.SUPER_ADMIN_EMAIL;
const TZ = 'America/Lima';

if (FORBIDDEN_SLUGS.has(BRAND)) throw new Error('marca prohibida');

// ---------------- resultados ----------------
const R = {};
const S = { stamp: STAMP, eventSlug: EVENT_SLUG, promo: PROMO, orders: {} };
const LETTERS = 'ABCDEFGHIJK'.split('');
for (const k of LETTERS) R[k] = { ok: null, checks: [], notes: [] };
const check = (k, name, cond, detail = '') => {
  R[k].checks.push({ name, ok: !!cond, detail: String(detail).slice(0, 400) });
  log(`${k} ${cond ? '✔' : '✘'} ${name}${detail ? ' — ' + String(detail).slice(0, 200) : ''}`);
};
const note = (k, msg) => { R[k].notes.push(msg); log(`${k} · ${msg}`); };
let shotN = 0;
const shot = async (page, k, name) => {
  const f = `${k}-${String(++shotN).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: resolve(OUT, f), fullPage: true }).catch((e) => log('shot err', e.message));
  return f;
};
async function step(k, title, fn) {
  log(`===== ${k}. ${title}`);
  try {
    await fn();
  } catch (e) {
    const msg = e.message.split('\n').filter((l) => l.trim() && !/^=+/.test(l)).slice(0, 3).join(' / ');
    R[k].checks.push({ name: 'excepción', ok: false, detail: msg.slice(0, 400) });
    log(`${k} EXCEPCIÓN`, msg);
    for (const [tag, x] of Object.entries(PAGES)) if (x?.page && !x.page.isClosed()) await shot(x.page, k, `ERROR-${tag}`);
  }
  R[k].ok = R[k].checks.length > 0 && R[k].checks.every((c) => c.ok);
  saveJson('results.json', { R, S });
}

const PAGES = {};
// ---------------- DB helpers (lectura) ----------------
const { data: brandRow } = await svc.from('brands').select('id, slug').eq('slug', BRAND).single();
if (!brandRow || brandRow.slug !== BRAND) throw new Error('demotest no encontrada');
const BRAND_ID = brandRow.id;
const dbBrand = async () => (await svc.from('brands').select('event_balance, archived_at').eq('id', BRAND_ID).single()).data;
const dbTypes = async () =>
  (await svc.from('ticket_types').select('id, name, capacity, sold, reserved, max_scans').eq('event_id', S.eventId).order('sort_order')).data ?? [];
const typeBy = async (name) => (await dbTypes()).find((t) => t.name === name);
const dbOrder = async (id) =>
  (await svc.from('orders').select('id, status, total_cents, subtotal_cents, discount_cents, promo_code_id, email_sent_at, brand_id, event_id').eq('id', id).single()).data;
const dbTickets = async (orderId) =>
  (await svc.from('tickets').select('id, qr_code, ticket_type_name, max_scans, scan_count').eq('order_id', orderId)).data ?? [];
// Stock efectivo "tomado" (vendidas + reservas activas) — la fuente de verdad es el ledger 0031.
async function activeHolds(ticketTypeId) {
  const { data, error } = await svc.from('stock_reservations').select('*').eq('ticket_type_id', ticketTypeId);
  if (error) return { err: error.message };
  const now = Date.now();
  const active = (data ?? []).filter((r) => !r.released_at && !r.consumed_at && (!r.expires_at || Date.parse(r.expires_at) > now));
  return { total: active.reduce((s, r) => s + (r.quantity ?? 0), 0), rows: data.length, cols: data[0] ? Object.keys(data[0]) : [] };
}

// ---------------- navegador ----------------
const browser = await chromium.launch({ headless: true });
const ctxOpts = { timezoneId: TZ, locale: 'es-PE' };
const consoleErrors = [];
function wire(page, tag) {
  page.__dialogs = [];
  page.on('dialog', (d) => {
    page.__dialogs.push(`${d.type()}: ${d.message()}`);
    if (page.__dismissNext && d.type() === 'confirm') { page.__dismissNext = false; d.dismiss().catch(() => {}); return; }
    d.accept().catch(() => {});
  });
  page.on('pageerror', (e) => consoleErrors.push(`${tag} pageerror: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${tag} console: ${m.text().slice(0, 200)}`); });
  return page;
}
async function newCtx(tag, { session, brandHeader = false, viewport = { width: 1280, height: 1000 } } = {}) {
  const ctx = await browser.newContext({
    ...ctxOpts, viewport,
    ...(brandHeader ? { extraHTTPHeaders: { 'x-parygo-brand-slug': BRAND } } : {}),
  });
  if (session) await ctx.addCookies(sessionCookies(session));
  // Los toasts de sonner duran ~4s: los registramos todos en window.__toastLog.
  await ctx.addInitScript(() => {
    window.__toastLog = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('[data-sonner-toast]')) {
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (t && !el.__logged) { el.__logged = true; window.__toastLog.push(t); }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const page = wire(await ctx.newPage(), tag);
  return { ctx, page };
}
// 'load' + quietud best-effort: hay prefetches RSC de <Link> que en `next start` local no cierran nunca.
const settle = (page) => page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
const go = async (page, path) => { await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 90000 }); await settle(page); };

// Comprobante dummy (PNG) para Yape.
const PROOF = resolve(OUT, 'proof.png');
{
  const { ctx, page } = await newCtx('proof', { viewport: { width: 380, height: 300 } });
  await page.setContent(`<body style="margin:0;font-family:sans-serif"><div style="background:#742384;color:#fff;padding:24px;text-align:center"><b style="font-size:22px">yape</b><div style="font-size:30px;font-weight:800">S/ E2E</div></div><p style="padding:16px">Comprobante DUMMY de prueba E2E ${STAMP}</p></body>`);
  await page.screenshot({ path: PROOF });
  await ctx.close();
}

// ---------------- sesiones ----------------
const superSess = await otpSession(SUPER_EMAIL);
const valSess = await otpSession(VALIDATOR_EMAIL);
const sup = await newCtx('super', { session: superSess });
let adm; // brand admin: login REAL por formulario (paso B)
const buyer = await newCtx('buyer', { brandHeader: true, viewport: { width: 1280, height: 1000 } });
const val = await newCtx('validator', { session: valSess, viewport: { width: 460, height: 950 } });
Object.assign(PAGES, { super: sup, buyer, validator: val });
// Los botones de compra existen duplicados (rail desktop + barra mobile): solo el visible.
const vis = (loc) => loc.filter({ visible: true }).first();
// Re-envía una server action capturada con otros argumentos (mismo action id,
// mismos headers de Next). Devuelve el texto crudo de la respuesta RSC.
async function replayAction(page, captured, args) {
  const keep = ['next-action', 'next-router-state-tree', 'content-type', 'accept', 'x-parygo-brand-slug'];
  const headers = Object.fromEntries(Object.entries(captured.headers).filter(([k]) => keep.includes(k)));
  const resp = await page.request.post(captured.url, { headers, data: JSON.stringify(args) });
  return { status: resp.status(), text: await resp.text() };
}
const holdsOn = async (ticketTypeId) =>
  ((await svc.from('stock_reservations').select('quantity, expires_at').eq('ticket_type_id', ticketTypeId)).data ?? [])
    .filter((r) => Date.parse(r.expires_at) > Date.now()).reduce((a, r) => a + r.quantity, 0);
const toastLog = async (page) => page.evaluate(() => window.__toastLog || []).catch(() => []);

// =====================================================================
await step('A', 'Super admin: login, desarchivar demotest, cargar saldo, stats', async () => {
  const p = sup.page;
  note('A', 'Login del super admin por sesión JWT real (magic link generado por service-role, sin email ni cambio de password): la contraseña de Paul no está disponible para el E2E.');
  await go(p, '/cabina-7k29x');
  check('A', 'entra a la cabina (guard superAdmin)', /cabina-7k29x/.test(p.url()), p.url());
  const statTxt = async () => (await p.locator('.s-stats, .s-stat').first().locator('..').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const statsBefore = await statTxt();
  await shot(p, 'A', 'cabina-antes');

  await go(p, `/cabina-7k29x/brands/${BRAND}`);
  const before = await dbBrand();
  S.balanceBefore = before.event_balance;
  note('A', `demotest antes: archived_at=${before.archived_at ? 'sí' : 'no'} saldo=${before.event_balance}`);
  await shot(p, 'A', 'marca-antes');

  if (before.archived_at) {
    await p.getByRole('button', { name: 'Desarchivar' }).click();
    for (let i = 0; i < 40 && (await dbBrand()).archived_at; i++) await sleep(500);
  }
  const afterArch = await dbBrand();
  check('A', 'demotest desarchivada (DB archived_at=null)', afterArch.archived_at === null, afterArch.archived_at);

  await p.selectOption('#pack-select', '1'); // Pack 1: menor ruido en el log de packs (cada carga queda en events_log)
  await p.getByRole('button', { name: 'Cargar pack' }).click();
  await p.getByRole('button', { name: 'Cargar pack' }).and(p.locator(':enabled')).waitFor({ timeout: 30000 }).catch(() => {});
  await sleep(1500);
  const packMsg = await p.locator('form:has(#pack-select) .s-hint--ok, form:has(#pack-select) .s-err').first().innerText().catch(() => '(sin mensaje en UI)');
  const afterPack = await dbBrand();
  check('A', 'pack 1 cargado (saldo +1)', afterPack.event_balance === before.event_balance + 1, `${before.event_balance} → ${afterPack.event_balance} · "${packMsg}"`);
  const packToast = (await toastLog(p)).find((t) => /Pack|saldo|cargad/i.test(t));
  check('A', 'bug5: "Cargar pack" muestra confirmación', !!packToast || /cargad|saldo/i.test(packMsg), packToast ?? packMsg);
  await go(p, `/cabina-7k29x/brands/${BRAND}`);
  // Paul setea la contraseña fija del brand_admin de demotest (la usa el paso B).
  const pwdForm = p.locator('form.s-pwd-form').first();
  await pwdForm.locator('input[name="password"]').fill(ADMIN_PASS);
  await pwdForm.getByRole('button', { name: /Setear contraseña/ }).click();
  await sleep(500);
  await pwdForm.getByRole('button', { name: /Setear contraseña/ }).waitFor({ timeout: 30000 });
  await sleep(1500);
  const pwdMsg = await pwdForm.locator('.s-hint--ok, .s-err').first().innerText().catch(() => '');
  const { error: pwdErr } = await anon().auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS });
  check('A', 'super admin setea contraseña del brand_admin demotest (login con la nueva funciona)', !pwdErr, pwdErr?.message ?? 'ok');
  const pwdToast = (await toastLog(p)).find((t) => /Contraseña actualizada/.test(t));
  check('A', 'bug5: "Setear contraseña" muestra "Contraseña actualizada."', !!pwdToast || /actualizada/i.test(pwdMsg), pwdToast ?? (pwdMsg || '(sin mensaje)'));
  const saldoUi = (await p.locator('.s-stat').first().innerText()).replace(/\s+/g, ' ');
  check('A', 'UI muestra saldo nuevo', saldoUi.includes(String(afterPack.event_balance)), saldoUi);
  await shot(p, 'A', 'marca-despues');

  await go(p, '/cabina-7k29x');
  const statsAfter = await statTxt();
  await shot(p, 'A', 'cabina-despues');
  const num = (s, label) => { const m = s.match(new RegExp(label + '\\s*(\\d+)', 'i')); return m ? +m[1] : null; };
  const mb = num(statsBefore, 'Marcas activas'), ma = num(statsAfter, 'Marcas activas');
  note('A', `stats antes: "${statsBefore.slice(0, 160)}" | después: "${statsAfter.slice(0, 160)}"`);
  check('A', 'stats reflejan (Marcas activas +1 al desarchivar)', before.archived_at ? ma === mb + 1 : ma === mb, `${mb} → ${ma}`);
  const rowTxt = (await p.locator('tr', { hasText: 'Demo Test' }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  note('A', `fila demotest en cabina: "${rowTxt}"`);
});

// =====================================================================
await step('B', 'Organizador: crear evento, entradas, promo, preventa, publicar, evento pasado', async () => {
  adm = await newCtx('admin');
  PAGES.admin = adm;
  const p = adm.page;
  await go(p, '/login');
  await p.fill('#email', ADMIN_EMAIL);
  await p.fill('#password', ADMIN_PASS);
  await Promise.all([p.waitForURL(/\/admin/, { timeout: 30000 }), p.locator('button[type=submit]').click()]);
  check('B', 'login brand_admin por formulario', /\/admin/.test(p.url()), p.url());
  await settle(p);
  await shot(p, 'B', 'panel');

  const now = new Date();
  const day = 86400000;
  const starts = new Date(Math.floor((now.getTime() + 10 * day) / 3600000) * 3600000);
  const ends = new Date(starts.getTime() + 7 * 3600000);
  const phaseUp = new Date(Math.floor((now.getTime() + 3 * day) / 3600000) * 3600000);

  async function fillBuilder({ name, slug, startsAt, endsAt, types, bypassMin = false }) {
    await go(p, '/admin/events/new');
    if (bypassMin) await p.evaluate(() => document.querySelectorAll('input[type=datetime-local]').forEach((i) => i.removeAttribute('min')));
    await p.fill('#name', name);
    await p.fill('#slug', slug);
    await p.fill('#description', 'Evento de prueba E2E automatizado — no comprar.');
    await p.fill('#starts_at', limaLocal(startsAt));
    if (endsAt) await p.fill('#ends_at', limaLocal(endsAt));
    await p.fill('#venue_name', 'Local E2E');
    await p.fill('#venue_address', 'Av. Test 123, Lima');
    const sec = p.locator('section.s-card').nth(1);
    for (let i = 0; i < types.length; i++) {
      if (i > 0) await sec.getByRole('button', { name: 'Tipo', exact: true }).click();
      const card = sec.locator(':scope > .s-stack > .s-card').nth(i);
      const t = types[i];
      await card.locator('input[placeholder="General / VIP"]').fill(t.name);
      if (t.desc) await card.locator('textarea').fill(t.desc);
      if (t.unlimited) await card.getByText('Stock ilimitado').click();
      else await card.locator('div:has(> label:text-is("Cupo")) > input').fill(String(t.capacity));
      for (let j = 0; j < t.phases.length; j++) {
        if (j > 0) await card.getByRole('button', { name: 'Fase', exact: true }).click();
        if (bypassMin) await p.evaluate(() => document.querySelectorAll('input[type=datetime-local]').forEach((i) => i.removeAttribute('min')));
        await card.locator('input[placeholder="30"]').nth(j).fill(String(t.phases[j].price));
        if (t.phases[j].until) await card.locator('input[type="datetime-local"]').nth(j).fill(limaLocal(t.phases[j].until));
      }
    }
  }

  await fillBuilder({
    name: `E2E Septiembre ${STAMP}`, slug: EVENT_SLUG, startsAt: starts, endsAt: ends,
    types: [
      { name: 'General', capacity: 50, desc: 'Entrada general', phases: [{ price: 20, until: phaseUp }, { price: 30 }] },
      { name: 'VIP', capacity: 5, desc: 'Zona VIP', phases: [{ price: 50 }] },
      { name: 'Cortesía', capacity: 10, desc: 'Invitación', phases: [{ price: 0 }] },
    ],
  });
  await shot(p, 'B', 'builder-lleno');
  const balBefore = (await dbBrand()).event_balance;
  const createReqP = p.waitForRequest((q) => q.method() === 'POST' && !!q.headers()['next-action'] && q.url().includes('/admin/events/new'), { timeout: 45000 }).catch(() => null);
  await p.getByRole('button', { name: 'Crear evento' }).click();
  const createReq = await createReqP;
  S.createReq = createReq ? { url: createReq.url(), headers: createReq.headers(), body: createReq.postDataBuffer()?.toString('utf8') ?? '' } : null;
  check('B', 'bug4: crear con un tipo S/0 con aforo pide confirmación', p.__dialogs.some((d) => /confirm: .*Cortesía.*S\/ 0/.test(d)), p.__dialogs.join(' | '));
  await p.waitForURL(/\/admin\/events\/[0-9a-f-]{36}/, { timeout: 45000 }).catch(() => {});
  const m = p.url().match(/\/admin\/events\/([0-9a-f-]{36})/);
  if (!m) {
    const err = await p.locator('.s-banner--err, .s-err').allInnerTexts();
    await shot(p, 'B', 'crear-error');
    throw new Error(`no se creó el evento: ${err.join(' | ')}`);
  }
  S.eventId = m[1];
  await settle(p);
  await shot(p, 'B', 'evento-creado');
  const { data: ev } = await svc.from('events').select('id, brand_id, starts_at, ends_at, is_published').eq('id', S.eventId).single();
  check('B', 'evento creado en demotest con ends_at', ev.brand_id === BRAND_ID && !!ev.ends_at, `starts=${ev.starts_at} ends=${ev.ends_at}`);
  check('B', 'consume 1 de saldo', (await dbBrand()).event_balance === balBefore - 1, `${balBefore} → ${(await dbBrand()).event_balance}`);
  const types = await dbTypes();
  const { data: phases } = await svc.from('ticket_type_price_phases').select('ticket_type_id, price_cents, starts_at, ends_at, sort_order').in('ticket_type_id', types.map((t) => t.id));
  const g = types.find((t) => t.name === 'General'), v = types.find((t) => t.name === 'VIP'), c = types.find((t) => t.name === 'Cortesía');
  S.types = Object.fromEntries(types.map((t) => [t.name, t.id]));
  check('B', 'General stock 50 / VIP 5 / Cortesía 10', g?.capacity === 50 && v?.capacity === 5 && c?.capacity === 10, types.map((t) => `${t.name}:${t.capacity}`).join(' '));
  const gp = (phases ?? []).filter((x) => x.ticket_type_id === g?.id).sort((a, b) => a.sort_order - b.sort_order);
  check('B', 'preventa con subida (General 20 → 30)', gp.length === 2 && gp[0].price_cents === 2000 && gp[1].price_cents === 3000, JSON.stringify(gp.map((x) => [x.price_cents, x.ends_at])));

  // Promo 20%
  await go(p, `/admin/events/${S.eventId}`);
  if (!(await p.locator('#promo_code').isVisible())) await p.getByText('Códigos de RR.PP.').first().click();
  await p.fill('#promo_code', PROMO);
  await p.fill('#promo_label', 'RRPP E2E');
  await p.selectOption('#promo_discount_type', 'percent');
  await p.fill('#promo_value', '20');
  await p.getByRole('button', { name: 'Crear código' }).click();
  await sleep(3000);
  const { data: promoRow } = await svc.from('promo_codes').select('id, code, discount_type, discount_value, is_active').eq('event_id', S.eventId).maybeSingle();
  check('B', `promo ${PROMO} 20% creada`, promoRow?.discount_type === 'percent' && Number(promoRow?.discount_value) === 20, JSON.stringify(promoRow) + ' ' + (await toasts(p)).join('|'));
  await shot(p, 'B', 'promo-creada');

  // Publicar
  await p.getByRole('button', { name: /Publicar evento/ }).click();
  await sleep(3000);
  const pub = (await svc.from('events').select('is_published').eq('id', S.eventId).single()).data;
  check('B', 'evento publicado', pub.is_published === true);
  const { data: ap, error: apErr } = await svc.rpc('get_event_active_prices', { p_event_id: S.eventId });
  const gId = S.types.General;
  check('B', 'precio activo General = S/20 (fase 1, server-side)', (ap ?? []).find((r) => r.ticket_type_id === gId)?.active_price_cents === 2000, apErr?.message ?? JSON.stringify(ap));
  await go(p, `/admin/events/${S.eventId}`);
  await shot(p, 'B', 'publicado');

  // ---- Bug 4: validaciones de evento en el server (antes de consumir saldo) ----
  // Re-envío el request real de "Crear evento" alterado. Ninguno debe crear
  // evento ni descontar saldo.
  if (S.createReq?.body) {
    const replayCreate = async (label, mutate) => {
      const slug = `e2e-inval-${STAMP}-${label}`;
      let body = S.createReq.body.split(EVENT_SLUG).join(slug);
      body = mutate(body);
      const bal0 = (await dbBrand()).event_balance;
      const keep = ['next-action', 'next-router-state-tree', 'content-type', 'accept'];
      const headers = Object.fromEntries(Object.entries(S.createReq.headers).filter(([k]) => keep.includes(k)));
      const resp = await p.request.post(S.createReq.url, { headers, data: Buffer.from(body, 'utf8') });
      const text = await resp.text();
      const { data: evs } = await svc.from('events').select('id').eq('slug', slug);
      const bal1 = (await dbBrand()).event_balance;
      return { text, created: (evs ?? []).length, balDelta: bal1 - bal0 };
    };
    const lastMsg = (t) => (t.match(/"message":"([^"]+)"/g) ?? []).pop() ?? t.slice(-160);
    const r1 = await replayCreate('pasado', (b) => b.split(limaLocal(starts)).join(limaLocal(new Date(now.getTime() - 3 * day))));
    check('B', 'bug4: server rechaza crear con inicio pasado (sin evento, sin gastar saldo)', /ya pasó/.test(r1.text) && !r1.created && r1.balDelta === 0, `${lastMsg(r1.text)} · creados=${r1.created} Δsaldo=${r1.balDelta}`);
    const r2 = await replayCreate('finantes', (b) => b.split(limaLocal(ends)).join(limaLocal(new Date(starts.getTime() - 3600000))));
    check('B', 'bug4: server rechaza fin <= inicio', /posterior al inicio/.test(r2.text) && !r2.created && r2.balDelta === 0, `${lastMsg(r2.text)} · creados=${r2.created} Δsaldo=${r2.balDelta}`);
    const r3 = await replayCreate('gratisinf', (b) => b.replace('"capacity":10,"is_unlimited":false', '"capacity":0,"is_unlimited":true'));
    check('B', 'bug4: server rechaza tipo S/0 + ilimitado', /gratis e ilimitado/.test(r3.text) && !r3.created && r3.balDelta === 0, `${lastMsg(r3.text)} · creados=${r3.created} Δsaldo=${r3.balDelta}`);
    const r4 = await replayCreate('sinconfirm', (b) => b.replace(/(name="[^"]*confirm_free"\r\n\r\n)1/, '$1'));
    check('B', 'bug4: server exige confirmación para tipo S/0 con aforo', /Confirmá que/.test(r4.text) && !r4.created && r4.balDelta === 0, `${lastMsg(r4.text)} · creados=${r4.created} Δsaldo=${r4.balDelta}`);
  } else note('B', 'no se capturó el request de crear evento: se saltean los replays del bug 4');

  // UI: S/0 + ilimitado se frena antes de enviar (alerta, sin navegar).
  p.__dialogs = [];
  await fillBuilder({
    name: `E2E Inval ${STAMP}`, slug: `e2e-inval-${STAMP}-ui`, startsAt: starts, endsAt: ends,
    types: [{ name: 'Gratis', unlimited: true, phases: [{ price: 0 }] }],
  });
  await p.getByRole('button', { name: 'Crear evento' }).click();
  await sleep(1500);
  await shot(p, 'B', 'builder-gratis-ilimitado');
  check('B', 'bug4: builder frena S/0 + ilimitado con alerta', p.__dialogs.some((d) => /alert: .*gratis e ilimitado/.test(d)) && /\/admin\/events\/new/.test(p.url()), p.__dialogs.join(' | '));

  // Editar: mover el inicio corre el fin con el mismo delta; al pasado se rechaza.
  const ev0 = (await svc.from('events').select('starts_at, ends_at').eq('id', S.eventId).single()).data;
  await go(p, `/admin/events/${S.eventId}/editar`);
  await p.fill('#ev-date', limaLocal(new Date(Date.parse(ev0.starts_at) + day)));
  await p.getByRole('button', { name: 'Guardar evento' }).click();
  await sleep(3500);
  const ev1 = (await svc.from('events').select('starts_at, ends_at').eq('id', S.eventId).single()).data;
  const durOk = Date.parse(ev1.ends_at) - Date.parse(ev1.starts_at) === Date.parse(ev0.ends_at) - Date.parse(ev0.starts_at);
  check('B', 'bug4: editar la fecha (+1 día) corre el fin igual (misma duración)', Date.parse(ev1.starts_at) - Date.parse(ev0.starts_at) === day && durOk, `${ev0.starts_at}→${ev1.starts_at} · fin ${ev0.ends_at}→${ev1.ends_at}`);
  await go(p, `/admin/events/${S.eventId}/editar`);
  await p.fill('#ev-date', limaLocal(new Date(now.getTime() - 2 * day)));
  await p.getByRole('button', { name: 'Guardar evento' }).click();
  await sleep(3500);
  const editMsg = (await p.locator('.s-banner--err, .s-banner--ok').allInnerTexts()).join(' | ');
  const ev2 = (await svc.from('events').select('starts_at').eq('id', S.eventId).single()).data;
  await shot(p, 'B', 'editar-fecha-pasada');
  check('B', 'bug4: editar la fecha al pasado se rechaza', /ya pasó/.test(editMsg) && ev2.starts_at === ev1.starts_at, `${editMsg} · starts=${ev2.starts_at}`);

  // Evento con fecha pasada: no se puede publicar ni comprar. Uso el evento viejo
  // de demotest (fiesta-prueba, junio, borrador).
  const { data: oldEv } = await svc.from('events').select('id, slug, is_published').eq('brand_id', BRAND_ID).eq('slug', 'fiesta-prueba').maybeSingle();
  if (oldEv) {
    await go(p, `/admin/events/${oldEv.id}`);
    const t0 = (await toastLog(p)).length;
    await p.getByRole('button', { name: /Publicar evento/ }).click().catch(() => {});
    await sleep(3000);
    const pubMsgs = (await toastLog(p)).slice(t0).join(' | ');
    const oldPub = (await svc.from('events').select('is_published').eq('id', oldEv.id).single()).data.is_published;
    await shot(p, 'B', 'publicar-evento-pasado');
    check('B', 'bug4: no se puede publicar un evento que ya terminó', !oldPub && /ya terminó/.test(pubMsgs), `publicado=${oldPub} · ${pubMsgs}`);
    await go(p, `/admin/events/${oldEv.id}/editar`);
    const balC0 = (await dbBrand()).event_balance;
    const tc = (await toastLog(p)).length;
    await p.getByRole('button', { name: /Clonar como borrador/ }).click();
    await sleep(3500);
    const cloneMsgs = (await toastLog(p)).slice(tc).join(' | ');
    const balC1 = (await dbBrand()).event_balance;
    await shot(p, 'B', 'clonar-evento-pasado');
    check('B', 'bug4 (review): clonar un evento pasado se rechaza sin gastar saldo', /ya pasó/.test(cloneMsgs) && balC1 === balC0, `${cloneMsgs} · saldo ${balC0}→${balC1}`);
    await go(buyer.page, `/${oldEv.slug}`);
    const txt = await bodyText(buyer.page);
    await shot(buyer.page, 'B', 'evento-pasado-publico');
    check('B', 'evento pasado NO se puede comprar (sin selector de entradas)', (await buyer.page.getByRole('button', { name: /Sumar/ }).count()) === 0, txt.slice(0, 140));
  }
});

if (!S.eventId) {
  log('Sin evento: se abortan C→K');
} else {
  // ---------------- compra por UI ----------------
  async function buy({ items, email, name, promo, method = 'yape', tag, shots = false }) {
    const p = buyer.page;
    await go(p, `/${EVENT_SLUG}`);
    if (shots) await shot(p, tag, 'evento');
    // La reserva del carrito es una server action con debounce de 400 ms: esperar
    // a que vuelva su respuesta antes de mirar el estado del botón.
    let lastReserve = null;
    const onResp = (r) => { if (r.request().method() === 'POST' && r.request().headers()['next-action'] && (r.request().postData() || '').startsWith('["')) lastReserve = Date.now(); };
    p.on('response', onResp);
    for (const [t, n] of Object.entries(items)) {
      for (let i = 0; i < n; i++) { await vis(p.getByRole('button', { name: `Sumar ${t}` })).click(); await sleep(250); }
    }
    const tWait = Date.now();
    while (Date.now() - tWait < 12000 && (!lastReserve || Date.now() - lastReserve < 800)) await sleep(200);
    p.off('response', onResp);
    const contBtn = vis(p.getByRole('button', { name: /^Continuar/ }));
    if (await contBtn.isDisabled()) {
      // El server no reservó (sin cupo / no disponible) y el carrito quedó en 0.
      if (shots) await shot(p, tag, 'carrito-vacio');
      return { res: 'carrito-vacio', orderId: null, url: p.url(), toasts: await toastLog(p), continuarDisabled: true };
    }
    const railStep1 = (await p.locator('.c-rail').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (shots) await shot(p, tag, 'seleccion');
    if (promo) {
      await p.getByText('¿Tenés un código de promotor?').click().catch(() => {});
      await p.locator('input[placeholder="Código de promotor"]').fill(promo).catch(() => {});
    }
    await vis(p.getByRole('button', { name: /^Continuar/ })).click();
    await p.locator('#buyer_name').waitFor({ timeout: 15000 });
    if (shots) await shot(p, tag, 'paso2-morph');
    await p.fill('#buyer_name', name);
    await p.fill('#buyer_email', email);
    await p.fill('#buyer_phone', '+51 999 111 222');
    if (await p.locator('#buyer_dni').count()) await p.fill('#buyer_dni', '12345678');
    if (await p.locator('input[name="age_ok"]').count()) await p.check('input[name="age_ok"]');
    if (promo) {
      await p.locator('#buyer_phone').click(); // blur del email → aplica el código
      await p.locator('.c-promo-on').waitFor({ timeout: 15000 }).catch(() => {});
    }
    if (method === 'mp') await p.getByRole('radio', { name: 'Tarjeta' }).click();
    const rail = (await p.locator('.c-rail').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    const promoOn = (await p.locator('.c-promo-on').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (shots) await shot(p, tag, 'paso2-lleno');
    const tBefore = await toasts(p);
    // Capturamos el request real de la server action startCheckout para poder
    // re-enviarlo alterado (tests de server: un request armado a mano).
    const ckReqP = p.waitForRequest((q) => q.method() === 'POST' && !!q.headers()['next-action'] && (q.postData() || '').includes('"buyerEmail"'), { timeout: 30000 }).catch(() => null);
    await vis(p.locator('button[type=submit][form="checkout-form"]')).click();
    const res = await Promise.race([
      p.waitForURL(/\/yape\?order=|\/confirmacion\?order=/, { timeout: 30000 }).then(() => 'nav'),
      p.waitForFunction((n) => document.querySelectorAll('[data-sonner-toast]').length > n, tBefore.length, { timeout: 30000 }).then(() => 'toast'),
      p.locator('iframe, #wallet_container, [id*="wallet"]').first().waitFor({ timeout: 30000 }).then(() => 'mp'),
    ]).catch(() => 'timeout');
    await sleep(800);
    const orderId = new URL(p.url()).searchParams.get('order');
    const all = [...new Set([...(await toastLog(p)), ...(await toasts(p))])];
    const ck = await ckReqP;
    const checkoutReq = ck ? { url: ck.url(), headers: ck.headers(), body: ck.postData() } : null;
    return { res, orderId, url: p.url(), railStep1, rail, promoOn, toasts: all, checkoutReq };
  }
  async function uploadYape(tag, shots = false) {
    const p = buyer.page;
    await p.fill('#operation_number', STAMP + String(Math.floor(Math.random() * 900 + 100)));
    await p.fill('#security_code', 'ABC123');
    await p.locator('#receipt').setInputFiles(PROOF);
    await sleep(400);
    if (shots) await shot(p, tag, 'yape-form');
    await p.getByRole('button', { name: /Enviar comprobante/i }).click();
    await p.waitForURL(/\/confirmacion\?order=/, { timeout: 45000 });
    await settle(p);
    if (shots) await shot(p, tag, 'confirmacion');
    return bodyText(p, 300);
  }
  async function review(email, action, reason = 'Monto no coincide (E2E)') {
    const p = adm.page;
    await go(p, `/admin/events/${S.eventId}/yape`);
    const card = p.locator('.s-card').filter({ hasText: email }).filter({ has: p.getByRole('button', { name: /Aprobar y emitir QR/ }) }).last();
    await card.waitFor({ timeout: 20000 });
    if (action === 'approve') {
      await card.getByRole('button', { name: /Aprobar y emitir QR/ }).click();
    } else {
      await card.getByRole('button', { name: 'Rechazar' }).click();
      // la tarjeta pierde el botón "Aprobar" al abrir el panel de rechazo → locators a nivel página (hay uno solo abierto)
      await p.locator('input[placeholder^="Ej: monto"]').fill(reason);
      await p.getByRole('button', { name: 'Confirmar rechazo' }).click();
    }
    await p.waitForFunction(() => (window.__toastLog || []).length > 0, null, { timeout: 30000 }).catch(() => {});
    await sleep(1500);
    return toastLog(p);
  }

  // =====================================================================
  await step('C', 'Página pública: marca, selector, morph, totales con promo, checkout', async () => {
    const p = buyer.page;
    await go(p, '/');
    const landing = await bodyText(p, 500);
    await shot(p, 'C', 'marca-landing');
    // La landing destaca un solo "próximo evento": con varias corridas publicadas puede ser otro E2E.
    check('C', 'landing de marca muestra marca + evento publicado', /Demo Test/.test(landing) && /E2E Septiembre/.test(landing), landing.slice(0, 200));
    check('C', 'cosmético 7: la landing no dice "desde S/ 0" (la Cortesía no cuenta) y muestra "desde S/ 20"', !/desde S\/ 0\b/.test(landing) && /desde S\/ 20\b/.test(landing), (landing.match(/desde S\/ \d+/g) ?? []).join(' | '));
    const email = `e2e-c-${STAMP}@test.local`;
    S.buyerC = email;
    const r = await buy({ items: { General: 2, VIP: 1 }, email, name: `Comprador C ${STAMP}`, promo: PROMO, tag: 'C', shots: true });
    note('C', `rail paso1: "${r.railStep1.slice(0, 160)}"`);
    note('C', `rail paso2: "${r.rail.slice(0, 220)}" · promo: "${r.promoOn}"`);
    // lista: 2×20 + 50 = 90 → -20% = 72
    check('C', 'subtotal paso 1 = S/ 90', /90(\.00)?/.test(r.railStep1), r.railStep1.slice(0, 160));
    check('C', 'promo aplicada en UI (-S/18, total S/72)', /18/.test(r.promoOn) && /72/.test(r.rail), `${r.promoOn} | ${r.rail.slice(0, 160)}`);
    check('C', 'checkout redirige a /yape?order=', r.res === 'nav' && /\/yape\?order=/.test(r.url), `${r.res} ${r.url} ${r.toasts.join('|')}`);
    S.orders.C = r.orderId;
    S.checkoutReq = r.checkoutReq;
    if (r.orderId) {
      const o = await dbOrder(r.orderId);
      check('C', 'orden server-side: total 7200, desc 1800, promo ligado', o.total_cents === 7200 && o.discount_cents === 1800 && !!o.promo_code_id, JSON.stringify(o));
    }
  });

  // =====================================================================
  await step('D', 'Yape: comprobante → pendiente → sin ticket', async () => {
    if (!S.orders.C) throw new Error('sin orden de C');
    const conf = await uploadYape('D', true);
    const o = await dbOrder(S.orders.C);
    check('D', 'orden queda pending_yape_review', o.status === 'pending_yape_review', o.status);
    const tk = await dbTickets(S.orders.C);
    check('D', 'SIN tickets antes de aprobar', tk.length === 0, `tickets=${tk.length}`);
    check('D', 'confirmación muestra "en revisión"', /revis|confirm|pendiente|espera/i.test(conf), conf.slice(0, 200));
    await go(buyer.page, `/pedido/${S.orders.C}`);
    const ped = await bodyText(buyer.page, 300);
    await shot(buyer.page, 'D', 'pedido-pendiente');
    check('D', '/pedido sin QR mientras está pendiente', (await buyer.page.locator('.c-ticket__card').count()) === 0, ped.slice(0, 160));
  });

  // =====================================================================
  await step('E', 'Aprobar → ticket → mail → /t/[uuid] con QR', async () => {
    if (!S.orders.C) throw new Error('sin orden de C');
    await go(adm.page, `/admin/events/${S.eventId}/yape`);
    await shot(adm.page, 'E', 'admin-yape-pendiente');
    const t = await review(S.buyerC, 'approve');
    await shot(adm.page, 'E', 'admin-aprobado');
    note('E', `toast: ${t.join(' | ')}`);
    const o = await dbOrder(S.orders.C);
    const tk = await dbTickets(S.orders.C);
    check('E', 'orden paid + 3 tickets emitidos', o.status === 'paid' && tk.length === 3, `${o.status} tickets=${tk.length}`);
    S.ticketsC = tk;
    if (env.RESEND_API_KEY) {
      check('E', 'email marcado como enviado (email_sent_at)', !!o.email_sent_at, o.email_sent_at);
    } else {
      note('E', 'RESEND_API_KEY no está en apps/web/.env.local → en local sendTicketEmail devuelve "skipped/no_api_key" por diseño. Envío de mail NO verificable en local (no se pudo consultar Resend sin la API key).');
      check('E', 'email: no verificable en local (sin RESEND_API_KEY) — email_sent_at null esperado', o.email_sent_at === null, `email_sent_at=${o.email_sent_at}`);
    }
    if (tk[0]) {
      await go(buyer.page, `/t/${tk[0].qr_code}`);
      const qrEls = await buyer.page.evaluate(() => [...document.querySelectorAll('svg, img, canvas')].filter((e) => { const r = e.getBoundingClientRect(); return r.width >= 120 && r.height >= 120 && Math.abs(r.width - r.height) < 8; }).length);
      const txt = await bodyText(buyer.page, 300);
      await shot(buyer.page, 'E', 'ticket-t-uuid');
      check('E', '/t/[uuid] carga con QR', qrEls > 0 && !/no encontr|404/i.test(txt), `qrEls=${qrEls} · "${txt.slice(0, 140)}"`);
      await go(buyer.page, `/pedido/${S.orders.C}`);
      await shot(buyer.page, 'E', 'pedido-qrs');
      note('E', `QR cards en /pedido: ${await buyer.page.locator('.c-ticket__card').count()}`);
    }
  });

  // =====================================================================
  await step('F', 'Cortesía gratis: sin pago, respeta stock 10', async () => {
    // ---- Bug 3: un tipo S/0 en evento pago no se ofrece ni puede retener cupo ----
    const pb = buyer.page;
    await go(pb, `/${EVENT_SLUG}`);
    const cortVisible = await pb.getByText('Cortesía', { exact: true }).count();
    const sumarCort = await pb.getByRole('button', { name: 'Sumar Cortesía' }).count();
    await shot(pb, 'F', 'publico-sin-cortesia');
    check('F', 'bug3: la Cortesía S/0 NO aparece en la página pública de un evento pago', cortVisible === 0 && sumarCort === 0, `texto=${cortVisible} sumar=${sumarCort}`);
    // Capturo la server action real de reserva (al sumar 1 General) y la re-envío con la Cortesía.
    const resReqP = pb.waitForRequest((q) => q.method() === 'POST' && !!q.headers()['next-action'] && (q.postData() || '').includes(S.types.General), { timeout: 20000 });
    await vis(pb.getByRole('button', { name: 'Sumar General' })).click();
    const rq = await resReqP;
    const reserveReq = { url: rq.url(), headers: rq.headers(), body: rq.postData() };
    const [sid] = JSON.parse(reserveReq.body);
    await sleep(1500);
    const cortHold0 = await holdsOn(S.types['Cortesía']);
    const rr = await replayAction(pb, reserveReq, [sid, S.types['Cortesía'], 5]);
    const cortHold1 = await holdsOn(S.types['Cortesía']);
    check('F', 'bug3: reserva armada a mano de la Cortesía → rechazada, 0 cupo retenido', cortHold1 === cortHold0 && cortHold1 === 0 && /no disponible/i.test(rr.text), `status=${rr.status} holds ${cortHold0}→${cortHold1} · ${rr.text.slice(-160)}`);
    await vis(pb.getByRole('button', { name: 'Restar General' })).click();
    await sleep(1200);
    if (S.checkoutReq) {
      const base = JSON.parse(S.checkoutReq.body)[0];
      const emailF = `e2e-f-forjado-${STAMP}@test.local`;
      const r1 = await replayAction(pb, S.checkoutReq, [{ ...base, buyerEmail: emailF, promoCode: '', items: [{ ticketTypeId: S.types['Cortesía'], quantity: 1 }] }]);
      const emailP = `e2e-f-promo-${STAMP}@test.local`;
      const gHold0 = await holdsOn(S.types.General);
      const r2 = await replayAction(pb, S.checkoutReq, [{ ...base, buyerEmail: emailP, promoCode: 'NOEXISTE99', items: [{ ticketTypeId: S.types.General, quantity: 2 }] }]);
      const { data: forged } = await svc.from('orders').select('id,status').in('buyer_email', [emailF, emailP]);
      check('F', 'bug3: checkout armado a mano con la Cortesía → "no disponible", sin orden', /no disponible/i.test(r1.text) && (forged ?? []).length === 0, r1.text.slice(-160));
      check('F', 'bug3: código promo inválido se rechaza ANTES de crear orden/reservar', /inválido/i.test(r2.text) && (forged ?? []).length === 0 && (await holdsOn(S.types.General)) <= gHold0, `${r2.text.slice(-120)} · órdenes=${JSON.stringify(forged)}`);
    } else note('F', 'no se capturó el request de checkout en C: se saltean los replays de checkout');
    // F1: el organizador emite 10 cortesías (camino previsto). F2: la 11ª se rechaza.
    const p = adm.page;
    await go(p, `/admin/events/${S.eventId}/editar`);
    const emitir = async (qty) => {
      await p.selectOption('#ct_type', { label: 'Cortesía' });
      await p.fill('#ct_qty', String(qty));
      await p.fill('#ct_email', `e2e-cortesia-${STAMP}@test.local`);
      const form = p.locator('form:has(#ct_type)');
      await form.getByRole('button', { name: /Emitir y enviar/ }).click();
      await form.getByRole('button', { name: 'Emitiendo…' }).waitFor({ timeout: 5000 }).catch(() => {});
      await form.getByRole('button', { name: /Emitir y enviar/ }).waitFor({ timeout: 60000 });
      await sleep(800);
      const inline = (await form.locator('.s-banner--ok, .s-banner--err').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
      return inline || (await toastLog(p)).filter((t) => /cortesía|cupo/i.test(t)).pop() || '(sin mensaje)';
    };
    const m1 = await emitir(10);
    const { data: clog } = await svc.from('events_log').select('payload').eq('event_id', S.eventId).eq('type', 'courtesy_issued').order('created_at', { ascending: false }).limit(1);
    const cp = clog?.[0]?.payload ?? {};
    if (env.RESEND_API_KEY) {
      check('F', 'cosmético 8: log de cortesía email_sent coincide con el envío real', cp.email_sent === (cp.email_status === 'sent' || cp.email_status === 'already_sent'), JSON.stringify(cp));
    } else {
      check('F', 'cosmético 8: sin API key el log dice email_sent=false (skipped) y el mensaje no dice "enviadas"', cp.email_sent === false && cp.email_status === 'skipped' && /no se envió/.test(m1), `${JSON.stringify(cp)} · "${m1}"`);
    }
    await shot(p, 'F', 'cortesias-10');
    const c1 = await typeBy('Cortesía');
    const { data: ctk } = await svc.from('tickets').select('id, order_id').eq('ticket_type_id', S.types['Cortesía']);
    const { data: corders } = await svc.from('orders').select('id,total_cents,status,payment_method').eq('event_id', S.eventId).eq('payment_method', 'courtesy');
    check('F', '10 cortesías emitidas sin pago (orden courtesy total 0, paid)', ctk.length === 10 && corders.every((o) => o.total_cents === 0 && o.status === 'paid'), `${m1} · tickets=${ctk.length} sold=${c1.sold} orders=${JSON.stringify(corders)}`);
    await go(p, `/admin/events/${S.eventId}/editar`);
    const m2 = await emitir(1);
    await shot(p, 'F', 'cortesia-11-rechazada');
    const { data: ctk2 } = await svc.from('tickets').select('id').eq('ticket_type_id', S.types['Cortesía']);
    check('F', 'la 11ª cortesía se rechaza (stock 10 respetado)', /No hay cupo/i.test(m2) && ctk2.length === 10, `${m2} · tickets=${ctk2.length}`);
    // F3: el comprador público intenta llevar la Cortesía S/0 por el checkout (ya agotada por las 10 de cortesía).
    await go(buyer.page, `/${EVENT_SLUG}`);
    const cortAgotada = await buyer.page.locator('.c-soldout').count();
    note('F', `Cortesía en la página pública tras emitir 10: ${cortAgotada ? 'Agotado' : 'sigue ofreciéndose'} · botón Sumar Cortesía=${await buyer.page.getByRole('button', { name: 'Sumar Cortesía' }).count()}`);
    const r = (await buyer.page.getByRole('button', { name: 'Sumar Cortesía' }).count()) ? await buy({ items: { Cortesía: 1 }, email: `e2e-f-${STAMP}@test.local`, name: `Cortesia Publica ${STAMP}`, tag: 'F' }) : { res: 'sin-boton', url: '', toasts: [], orderId: null };
    await shot(buyer.page, 'F', 'checkout-cortesia-publica');
    note('F', `checkout público de Cortesía S/0 → ${r.res} ${r.url.replace(BASE, '')} toasts=${r.toasts.join('|')}`);
    if (r.orderId) note('F', `ALERTA: el checkout público creó orden ${r.orderId} para una Cortesía`);
  });

  // =====================================================================
  await step('G', 'Puerta: validar QR → reingreso → QR inventado', async () => {
    const p = val.page;
    await go(p, '/scan');
    await sleep(2500);
    await shot(p, 'G', 'scan-inicio');
    // Bug 6: la puerta solo lista eventos publicados y no archivados.
    const opts = await p.locator('select option').allInnerTexts();
    const { data: hidden } = await svc.from('events').select('name, is_published, archived_at').eq('brand_id', BRAND_ID).or('is_published.eq.false,archived_at.not.is.null');
    const leaked = (hidden ?? []).filter((e) => opts.includes(e.name)).map((e) => e.name);
    check('G', 'bug6: /scan lista el evento publicado y ningún borrador/archivado', opts.includes(`E2E Septiembre ${STAMP}`) && leaked.length === 0, `opciones=${JSON.stringify(opts)} · filtrados=${leaked.join(',') || 'ninguno'}`);
    const qr = S.ticketsC?.find((t) => t.ticket_type_name === 'General')?.qr_code;
    if (!qr) throw new Error('sin QR de E');
    const revisar = async (code) => {
      await p.fill('#manual-scan', code);
      await p.getByRole('button', { name: 'Revisar' }).click();
      await p.locator('.k-result__label').first().waitFor({ timeout: 15000 });
      await sleep(400);
      return (await p.locator('.k-result__label').first().innerText()).trim();
    };
    const l1 = await revisar(qr);
    await shot(p, 'G', 'scan1-preview');
    check('G', '1er escaneo: preview VÁLIDO con botón PASAR', /VÁLIDO/.test(l1) && (await p.getByRole('button', { name: 'PASAR', exact: true }).count()) > 0, l1);
    await p.getByRole('button', { name: 'PASAR', exact: true }).click();
    await sleep(2500);
    const after1 = await bodyText(p, 200);
    await shot(p, 'G', 'scan1-pasa');
    const tk1 = (await svc.from('tickets').select('scan_count, validated_at').eq('qr_code', qr).single()).data;
    check('G', 'PASAR consume el ticket (scan_count=1)', tk1.scan_count === 1, `${JSON.stringify(tk1)} · "${after1.slice(0, 100)}"`);
    await p.getByRole('button', { name: /Escanear otro/ }).first().click().catch(() => {});
    await sleep(800);
    const l2 = await revisar(qr);
    const pasar2 = await p.getByRole('button', { name: 'PASAR', exact: true }).count();
    const sub2 = (await p.locator('.k-result__sub').allInnerTexts()).join(' ');
    await shot(p, 'G', 'scan2-reingreso');
    const mx = S.ticketsC[0].max_scans;
    note('G', `max_scans del ticket = ${mx}. Con max_scans=1 el 2º escaneo es "YA USADO"; el estado RE-ENTRADA solo existe si max_scans>1 o ilimitado, y el builder de eventos siempre crea tipos con max_scans=1 (no hay UI para cambiarlo).`);
    check('G', '2º escaneo marcado (YA USADO/RE-ENTRADA) y bloqueado', /YA USADO|RE-ENTRADA/.test(l2) && pasar2 === 0, `${l2} · ${sub2} · PASAR=${pasar2}`);
    await p.getByRole('button', { name: /NO PASAR|Escanear otro/ }).first().click().catch(() => {});
    await sleep(600);
    const fake = '00000000-0000-4000-8000-' + STAMP.padStart(12, '0');
    const l3 = await revisar(fake);
    await shot(p, 'G', 'scan3-inventado');
    check('G', 'QR inventado → TICKET INVÁLIDO sin PASAR', /INVÁLIDO/.test(l3) && (await p.getByRole('button', { name: 'PASAR', exact: true }).count()) === 0, l3);
    const tk1b = (await svc.from('tickets').select('scan_count').eq('qr_code', qr).single()).data;
    check('G', 'el 2º escaneo no consumió (scan_count sigue 1)', tk1b.scan_count === 1, tk1b.scan_count);
    const { data: scans } = await svc.from('ticket_scans').select('validator_user_id, result').eq('ticket_id', S.ticketsC.find((t) => t.qr_code === qr).id);
    check('G', 'trazabilidad: ticket_scans con validator_user_id del validador', (scans ?? []).some((s) => s.validator_user_id === valSess.user.id), JSON.stringify(scans));
  });

  // =====================================================================
  await step('H', 'Agotar VIP (5) → sexta falla limpio → sold out visible', async () => {
    // Después de C: VIP vendidas 1. Compro 4 más (Yape, pendiente = reserva).
    const e1 = `e2e-h1-${STAMP}@test.local`;
    const r1 = await buy({ items: { VIP: 4 }, email: e1, name: `VIP Cuatro ${STAMP}`, tag: 'H' });
    S.orders.H4 = r1.orderId;
    check('H', 'compra de 4 VIP crea orden', r1.res === 'nav' && !!r1.orderId, `${r1.res} ${r1.toasts.join('|')}`);
    if (r1.orderId) await uploadYape('H');
    const v1 = await typeBy('VIP');
    const holds = await activeHolds(S.types.VIP);
    note('H', `VIP tras 4 pendientes: sold=${v1.sold} reserved=${v1.reserved} holds=${JSON.stringify(holds).slice(0, 200)}`);
    // Sexta (con 4 pendientes): debe fallar limpio.
    const r2 = await buy({ items: { VIP: 1 }, email: `e2e-h6-${STAMP}@test.local`, name: `VIP Sexta ${STAMP}`, tag: 'H' });
    await shot(buyer.page, 'H', 'sexta-con-pendientes');
    const { data: h6 } = await svc.from('orders').select('id,status').eq('event_id', S.eventId).eq('buyer_email', `e2e-h6-${STAMP}@test.local`);
    check('H', '6ª VIP NO se vende (anti-sobreventa: sin orden, sin ticket)', !r2.orderId && (h6 ?? []).every((o) => o.status === 'failed'), `${r2.res} · órdenes=${JSON.stringify(h6)}`);
    const crudo = /Array must|element(s)|violates|Expected|Required|invalid/i.test(r2.toasts.join(' '));
    check('H', 'bug2: 6ª VIP → "No quedan suficientes entradas de VIP." (sin error técnico)', r2.toasts.some((t) => /No quedan suficientes entradas de VIP/.test(t)) && !crudo, r2.toasts.join(' | '));
    check('H', 'bug2: con el carrito vacío no se puede avanzar a pagar (Continuar deshabilitado)', r2.continuarDisabled === true, `res=${r2.res}`);
    await shot(buyer.page, 'H', 'sexta-carrito-vacio');
    // Paso 2 → volver → vaciar: el botón de pagar también se deshabilita.
    await go(buyer.page, `/${EVENT_SLUG}`);
    await vis(buyer.page.getByRole('button', { name: 'Sumar General' })).click();
    await sleep(1200);
    await vis(buyer.page.getByRole('button', { name: /^Continuar/ })).click();
    await buyer.page.locator('#buyer_name').waitFor();
    await buyer.page.getByRole('button', { name: /Volver a entradas/ }).click();
    await vis(buyer.page.getByRole('button', { name: 'Restar General' })).click();
    await sleep(800);
    const payDisabled = await buyer.page.locator('button[type=submit][form="checkout-form"]').evaluateAll((els) => els.every((e) => e.disabled));
    const contDisabled = await vis(buyer.page.getByRole('button', { name: /^Continuar/ })).isDisabled();
    check('H', 'bug2: carrito en 0 → Continuar y pagar deshabilitados', contDisabled && payDisabled, `continuar=${contDisabled} pagar=${payDisabled}`);
    if (S.checkoutReq) {
      const base = JSON.parse(S.checkoutReq.body)[0];
      const rr = await replayAction(buyer.page, S.checkoutReq, [{ ...base, buyerEmail: `e2e-h-vacio-${STAMP}@test.local`, promoCode: '', items: [] }]);
      check('H', 'bug2: checkout armado con 0 entradas → "Elegí al menos una entrada." (español)', /Elegí al menos una entrada/.test(rr.text) && !/Array must/.test(rr.text), rr.text.slice(-140));
    }
    await go(buyer.page, `/${EVENT_SLUG}`);
    const soldOutWithHolds = await buyer.page.locator('.c-soldout').count();
    note('H', `Con 1 VIP pagada + 4 en revisión (holds), la página pública muestra "Agotado" en VIP: ${soldOutWithHolds > 0 ? 'sí' : 'NO (sigue ofreciendo Sumar VIP)'}`);
    S.H6pendingMsg = r2.toasts.join('|');
    const { data: failedOrd } = await svc.from('orders').select('id,status').eq('event_id', S.eventId).eq('buyer_email', `e2e-h6-${STAMP}@test.local`);
    note('H', `órdenes de la 6ª: ${JSON.stringify(failedOrd)}`);
    S.H6failedOrders = failedOrd;
  });

  // =====================================================================
  await step('I', 'Rechazar comprobante → cliente ve estado → stock liberado', async () => {
    if (!S.orders.H4) throw new Error('sin orden H4');
    const holdsBefore = await activeHolds(S.types.VIP);
    const t = await review(`e2e-h1-${STAMP}@test.local`, 'reject');
    await shot(adm.page, 'I', 'admin-rechazado');
    note('I', `toast: ${t.join(' | ')}`);
    const o = await dbOrder(S.orders.H4);
    check('I', 'orden rechazada (failed/rejected/cancelled)', ['failed', 'rejected', 'cancelled'].includes(o.status), o.status);
    check('I', 'sin tickets emitidos para la orden rechazada', (await dbTickets(S.orders.H4)).length === 0);
    await go(buyer.page, `/${EVENT_SLUG}/confirmacion?order=${S.orders.H4}`);
    const conf = await bodyText(buyer.page, 300);
    await shot(buyer.page, 'I', 'cliente-confirmacion-rechazado');
    await go(buyer.page, `/pedido/${S.orders.H4}`);
    const ped = await bodyText(buyer.page, 300);
    await shot(buyer.page, 'I', 'cliente-pedido-rechazado');
    check('I', 'cliente ve "Comprobante rechazado"', /rechazad/i.test(conf) && /rechazad/i.test(ped), `${conf.slice(0, 120)} || ${ped.slice(0, 120)}`);
    const holdsAfter = await activeHolds(S.types.VIP);
    note('I', `holds VIP antes=${JSON.stringify(holdsBefore).slice(0, 120)} después=${JSON.stringify(holdsAfter).slice(0, 120)}`);
    // Prueba funcional de liberación: ahora 4 VIP vuelven a estar disponibles.
    const e = `e2e-i-${STAMP}@test.local`;
    const r = await buy({ items: { VIP: 4 }, email: e, name: `VIP Libre ${STAMP}`, tag: 'I' });
    check('I', 'stock liberado: 4 VIP se pueden volver a comprar', r.res === 'nav' && !!r.orderId, `${r.res} ${r.toasts.join('|')}`);
    S.orders.I4 = r.orderId;
    if (r.orderId) { await uploadYape('I'); await review(e, 'approve'); }
  });

  // H (cont.): con las 5 VIP pagas, la vista pública debe mostrar Agotado.
  await (async () => {
    const k = 'H';
    try {
      const v = await typeBy('VIP');
      check(k, 'VIP 5/5 vendidas tras aprobar', v.sold === 5, `sold=${v.sold}`);
      await go(buyer.page, `/${EVENT_SLUG}`);
      const vipRow = buyer.page.locator('text=VIP').first().locator('xpath=ancestor::*[contains(@class,"c-")][1]');
      const soldOutCount = await buyer.page.locator('.c-soldout').count();
      const sumarVip = await buyer.page.getByRole('button', { name: 'Sumar VIP' }).count();
      await shot(buyer.page, k, 'publico-vip-agotado');
      check(k, 'sold out visible en la página pública (VIP "Agotado", sin botón Sumar)', soldOutCount >= 1 && sumarVip === 0, `c-soldout=${soldOutCount} sumarVIP=${sumarVip}`);
      void vipRow;
    } catch (e) { check(k, 'excepción (sold out)', false, e.message); }
    R[k].ok = R[k].checks.every((c) => c.ok);
  })();

  // =====================================================================
  await step('J', 'Panel: ventas en tiempo real y asistentes', async () => {
    const p = adm.page;
    await go(p, `/admin/events/${S.eventId}`);
    await shot(p, 'J', 'resumen');
    const rows = await p.locator('table.a-typetable tbody tr').allInnerTexts();
    const typesDb = await dbTypes();
    const ui = Object.fromEntries(rows.map((r) => { const c = r.split(/\t|\n/).map((x) => x.trim()).filter(Boolean); return [c[0], c]; }));
    note('J', `tabla UI: ${JSON.stringify(ui)}`);
    for (const t of typesDb) {
      const row = rows.find((r) => r.startsWith(t.name));
      const nums = (row ?? '').match(/\d+/g) ?? [];
      check('J', `Entradas por tipo — ${t.name}: vendidas UI = DB (${t.sold})`, row && nums.includes(String(t.sold)), `${row?.replace(/\s+/g, ' ')} | db sold=${t.sold} cap=${t.capacity}`);
    }
    // Recaudado: C (72) + I4 (200) = 272 pagados con Yape; cortesías 0.
    const { data: paid } = await svc.from('orders').select('total_cents').eq('event_id', S.eventId).eq('status', 'paid');
    const expected = (paid ?? []).reduce((s, o) => s + o.total_cents, 0);
    const foot = (await p.locator('table.a-typetable tfoot').innerText().catch(() => '')).replace(/\s+/g, ' ');
    check('J', `recaudado total = S/ ${(expected / 100).toFixed(2)}`, foot.replace(/,/g, '').includes((expected / 100).toFixed(2)) || foot.includes(String(expected / 100)), foot);
    // Clientes / asistentes
    await go(p, `/admin/events/${S.eventId}/clientes`);
    const cli = await bodyText(p, 3000);
    await shot(p, 'J', 'clientes');
    const mustShow = [S.buyerC, `e2e-i-${STAMP}@test.local`];
    const mustNot = [`e2e-h1-${STAMP}@test.local`];
    check('J', 'clientes lista compradores pagos', mustShow.every((e) => cli.includes(e)), mustShow.map((e) => `${e}:${cli.includes(e)}`).join(' '));
    note('J', `comprador rechazado aparece en clientes: ${mustNot.map((e) => cli.includes(e)).join(',')}`);
    // Tiempo real: /accesos con LiveRefresh; escaneamos otro QR y esperamos el auto-refresh.
    await go(p, `/admin/events/${S.eventId}/accesos`);
    const acc0 = await bodyText(p, 600);
    await shot(p, 'J', 'accesos-antes');
    const other = S.ticketsC?.find((t) => t.ticket_type_name === 'VIP')?.qr_code;
    if (other) {
      await go(val.page, '/scan');
      await val.page.fill('#manual-scan', other);
      await val.page.getByRole('button', { name: 'Revisar' }).click();
      await val.page.getByRole('button', { name: 'PASAR', exact: true }).click({ timeout: 15000 });
      await sleep(2000);
      const bump = (s) => (s.match(/\d+/g) ?? []).join(',');
      let acc1 = acc0, waited = 0;
      while (waited < 40000 && bump(acc1) === bump(acc0)) { await sleep(5000); waited += 5000; acc1 = await bodyText(p, 600); }
      await shot(p, 'J', 'accesos-despues-autorefresh');
      check('J', 'accesos se actualiza solo (LiveRefresh) tras un escaneo', bump(acc1) !== bump(acc0), `esperé ${waited / 1000}s · antes="${acc0.slice(0, 160)}" · después="${acc1.slice(0, 160)}"`);
    }
  });

  // =====================================================================
  await step('K', 'MercadoPago: se muestra/oculta según config sin romper', async () => {
    const p = buyer.page;
    const status0 = (await svc.rpc('get_brand_mp_status', { p_brand_id: BRAND_ID })).data?.[0];
    note('K', `estado MP inicial demotest: ${JSON.stringify(status0)}`);
    await go(p, `/${EVENT_SLUG}`);
    await vis(p.getByRole('button', { name: 'Sumar General' })).click();
    await vis(p.getByRole('button', { name: /^Continuar/ })).click();
    await p.locator('#buyer_name').waitFor();
    const tarjeta0 = await p.getByRole('radio', { name: 'Tarjeta' }).count();
    await shot(p, 'K', 'sin-mp-solo-yape');
    check('K', 'sin credenciales MP: no aparece "Tarjeta" (solo Yape)', tarjeta0 === 0 && (await p.getByRole('radio', { name: 'Yape' }).count()) === 1, `tarjeta=${tarjeta0}`);

    // Validación de UI: token inválido se rechaza limpio sin guardar.
    await go(adm.page, '/admin/settings');
    if (await adm.page.locator('#mp_access_token').count()) {
      await adm.page.fill('#mp_access_token', 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000');
      await adm.page.fill('#mp_public_key', 'TEST-00000000-0000-0000-0000-000000000000');
      await adm.page.getByRole('button', { name: /Validar y guardar/ }).click();
      await sleep(6000);
      const msg = (await adm.page.locator('.s-err, .s-banner--err, .s-banner').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
      await shot(adm.page, 'K', 'settings-token-invalido');
      const st = (await svc.rpc('get_brand_mp_status', { p_brand_id: BRAND_ID })).data?.[0];
      check('K', 'settings: token falso rechazado por validación contra MP, nada guardado', !st?.has_access_token, `${msg.slice(0, 200)} · status=${JSON.stringify(st)}`);
    }

    // Con credenciales (dummy, cargadas vía el mismo RPC que usa settings) → aparece Tarjeta.
    const { error: setErr } = await svc.rpc('set_brand_mp_credentials', {
      p_brand_id: BRAND_ID,
      p_access_token: 'TEST-e2e-dummy-token-no-valido',
      p_public_key: 'TEST-00000000-0000-0000-0000-000000000000',
      p_encryption_key: env.BRAND_CREDS_ENCRYPTION_KEY,
    });
    note('K', `set_brand_mp_credentials dummy (solo demotest): ${setErr ? setErr.message : 'ok'}`);
    try {
      const vHold0 = await typeBy('General');
      const email = `e2e-k-${STAMP}@test.local`;
      const r = await buy({ items: { General: 1 }, email, name: `MP Dummy ${STAMP}`, method: 'mp', tag: 'K' });
      await shot(p, 'K', 'con-mp-intento-pago');
      const tarjetaShown = await p.getByRole('radio', { name: 'Tarjeta' }).count();
      check('K', 'con credenciales MP: aparece "Tarjeta"', tarjetaShown === 1 || r.res !== 'timeout', `tarjeta=${tarjetaShown}`);
      const { data: ko } = await svc.from('orders').select('id,status,payment_method').eq('buyer_email', email).eq('event_id', S.eventId);
      const rawDb = /violates|constraint|relation "|duplicate key|syntax error/i.test(r.toasts.join(' '));
      check('K', 'pago con Tarjeta falla limpio (mensaje entendible, sin error crudo de BD, orden failed, sin ticket)', r.res === 'toast' && !rawDb && (ko ?? []).every((o) => o.status === 'failed'), `${r.res} · ${r.toasts.join('|')} · ${JSON.stringify(ko)}`);
      const g1 = await typeBy('General');
      note('K', `General sold antes/después intento MP: ${vHold0.sold}/${g1.sold}`);
    } finally {
      // Quitar credenciales por la UI (intent=remove) → vuelve a solo Yape.
      await go(adm.page, '/admin/settings');
      const rm = adm.page.getByRole('button', { name: 'Quitar credenciales' });
      if (await rm.count()) { await rm.first().click(); await sleep(4000); }
      let st = (await svc.rpc('get_brand_mp_status', { p_brand_id: BRAND_ID })).data?.[0];
      if (st?.has_access_token || st?.has_public_key) {
        note('K', 'botón de quitar no encontrado/no funcionó — limpio vía RPC');
        await svc.rpc('set_brand_mp_credentials', { p_brand_id: BRAND_ID, p_access_token: null, p_public_key: null, p_encryption_key: env.BRAND_CREDS_ENCRYPTION_KEY });
        st = (await svc.rpc('get_brand_mp_status', { p_brand_id: BRAND_ID })).data?.[0];
      }
      await shot(adm.page, 'K', 'settings-mp-quitado');
      check('K', 'credenciales MP removidas (demotest vuelve a solo Yape)', !st?.has_access_token && !st?.has_public_key, JSON.stringify(st));
    }
    await go(p, `/${EVENT_SLUG}`);
    await vis(p.getByRole('button', { name: 'Sumar General' })).click();
    await vis(p.getByRole('button', { name: /^Continuar/ })).click();
    await p.locator('#buyer_name').waitFor();
    check('K', 'tras quitar MP: "Tarjeta" desaparece de nuevo', (await p.getByRole('radio', { name: 'Tarjeta' }).count()) === 0);
    await shot(p, 'K', 'sin-mp-de-nuevo');
  });
}

// Almighty/Code intactos (solo lectura): la marca code no fue tocada por la suite.
S.consoleErrors = consoleErrors.slice(0, 60);
saveJson('results.json', { R, S });
await browser.close();
console.log('\n===== RESUMEN');
for (const k of LETTERS) console.log(`${k} ${R[k].ok === null ? '—' : R[k].ok ? '✅' : '❌'}  ${R[k].checks.filter((c) => !c.ok).map((c) => c.name + ': ' + c.detail).join(' || ').slice(0, 300)}`);
