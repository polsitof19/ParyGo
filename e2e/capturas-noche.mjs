// Capturas del TEMA NOCHE (rama design/noche) a 390 / 768 / 1024 / 1440:
// Evento (Canvas, con el flyer 4:5 de prueba que sube el E2E), Datos, Yape,
// Entrada, home de marca y el email de la entrada. SOLO demotest; solo
// lecturas, salvo la reserva de carrito que hace "Datos" al sumar una entrada
// (vence sola, igual que un comprador que abandona).
//
//   node e2e/capturas-noche.mjs      (server local en :3001; demotest activa
//                                     con el evento y las órdenes del E2E)
// Salida: tmp/capturas/noche/<pantalla>-<ancho>.png
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { svc, BASE, log } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'tmp', 'capturas', 'noche');
mkdirSync(OUT, { recursive: true });

const { data: marca } = await svc.from('brands').select('id, slug').eq('slug', 'demotest').single();
if (marca?.slug !== 'demotest') throw new Error('solo demotest');
const { data: evs } = await svc.from('events').select('id, slug').eq('brand_id', marca.id)
  .eq('is_published', true).is('archived_at', null).gt('starts_at', new Date().toISOString())
  .order('created_at', { ascending: false }).limit(1);
const ev = evs?.[0];
if (!ev) throw new Error('demotest sin evento publicado: correr el E2E antes');
const { data: pagas } = await svc.from('orders').select('id, tickets(qr_code)').eq('event_id', ev.id).eq('status', 'paid').order('created_at', { ascending: false }).limit(10);
const pagada = (pagas ?? []).find((o) => o.tickets?.length);
const { data: pend } = await svc.from('orders').select('id').eq('event_id', ev.id).eq('status', 'pending_yape_review').order('created_at', { ascending: false }).limit(1);

const B = `${BASE}/b/demotest`;
// Sin una orden Yape pendiente no hay pantalla de Yape que retratar: se hace
// UNA compra de prueba en demotest (1 General) hasta el comprobante, sin subirlo.
let yapeUrl = pend?.[0] ? `${B}/${ev.slug}/yape?order=${pend[0].id}` : null;
if (!yapeUrl) {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await pg.goto(`${B}/${ev.slug}`, { waitUntil: 'networkidle' });
  await pg.getByRole('button', { name: 'Sumar General' }).filter({ visible: true }).first().click();
  await pg.waitForTimeout(900);
  await pg.locator('.b-sum .b-btn--go').click();
  await pg.fill('#buyer_name', 'Capturas Noche');
  await pg.fill('#buyer_email', `e2e-capturas-${Date.now()}@test.local`);
  await pg.fill('#buyer_phone', '+51 999 111 222');
  if (await pg.locator('#buyer_dni').count()) await pg.fill('#buyer_dni', '12345678');
  if (await pg.locator('input[name="age_ok"]').count()) await pg.check('input[name="age_ok"]');
  await pg.locator('button[type=submit][form="checkout-form"]').filter({ visible: true }).first().click();
  await pg.waitForURL(/\/yape\?order=/, { timeout: 30000 });
  yapeUrl = pg.url();
  await b.close();
  log('orden de prueba para Yape: ' + new URL(yapeUrl).searchParams.get('order'));
}
const VISTAS = [
  { id: 'evento-canvas', url: `${B}/${ev.slug}` },
  { id: 'datos', url: `${B}/${ev.slug}`, datos: true },
  { id: 'yape', url: yapeUrl },
  ...(pagada ? [
    { id: 'entrada', url: `${B}/t/${pagada.tickets[0].qr_code}` },
    { id: 'confirmacion', url: `${B}/${ev.slug}/confirmacion?order=${pagada.id}` },
  ] : []),
  { id: 'home', url: `${B}` },
];
const email = resolve(ROOT, 'tmp', 'e2e', 'email-C.html');
if (existsSync(email)) VISTAS.push({ id: 'email', url: pathToFileURL(email).href });

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// 390 en CHROMIUM con emulación de iPhone (viewport, DPR 3, toque y UA), no en
// WebKit: el WebKit de Playwright en Windows maqueta la Geist variable con su
// peso (los anchos cambian) pero la RASTERIZA sin los ejes, y todo sale en 400.
// Safari real (CoreText) no tiene ese problema. Medido el 2026-09-23.
for (const [motor, ancho, alto] of [[chromium, 390, 844], [chromium, 768, 1024], [chromium, 1024, 800], [chromium, 1440, 900]]) {
  const browser = await motor.launch();
  const movil = ancho === 390;
  const ctx = await browser.newContext({
    viewport: { width: ancho, height: alto }, deviceScaleFactor: movil ? 3 : 1,
    isMobile: movil, hasTouch: movil, ...(movil ? { userAgent: UA_IPHONE } : {}),
  });
  const page = await ctx.newPage();
  for (const v of VISTAS) {
    // 'load' y no 'networkidle': la home deja una conexión abierta y nunca llega.
    const r = await page.goto(v.url, { waitUntil: 'load', timeout: 90000 }).catch(() => null);
    await page.waitForTimeout(1500); // imágenes + la entrada escalonada (680ms)
    if (v.datos) {
      await page.getByRole('button', { name: 'Sumar General' }).filter({ visible: true }).first().click();
      await page.waitForTimeout(700);
      await page.locator('.b-cta .b-btn--go, .b-sum .b-btn--go').filter({ visible: true }).first().click();
      await page.locator('#buyer_name').waitFor({ timeout: 15000 });
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: resolve(OUT, `${v.id}-${ancho}.png`), fullPage: true });
    log(`${ancho} ${v.id.padEnd(18)} ${r?.status() ?? 'file'}`);
    if (v.datos) {
      // Deja el carrito en 0 para no retener cupo.
      await page.goto(v.url, { waitUntil: 'load' }).catch(() => {});
    }
  }
  await ctx.close();
  await browser.close();
}
log('capturas en tmp/capturas/noche');
