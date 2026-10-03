// Captura la cola de Yapes por aprobar de demotest (solo lectura: abre la
// primera fila para ver el comprobante, no aprueba ni rechaza nada).
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { otpSession, sessionCookies, BASE, svc } from './lib.mjs';
import { ADMIN, DEMOTEST } from './vistas-paneles.mjs';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tmp', 'capturas', 'panel');
const { data: pend } = await svc.from('yape_proofs').select('order:orders!yape_proofs_order_id_fkey ( event_id )').eq('brand_id', DEMOTEST).eq('status', 'pending_review').limit(1);
const ev = pend?.[0]?.order?.event_id;
if (!ev) throw new Error('sin Yapes pendientes en demotest');
const sess = await otpSession(ADMIN);
const browser = await chromium.launch();
for (const ancho of [390, 1440]) {
  const movil = ancho === 390;
  const ctx = await browser.newContext({ viewport: { width: ancho, height: movil ? 844 : 900 }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil });
  await ctx.addCookies(sessionCookies(sess, BASE));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/events/${ev}/yape`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.locator('.a-yrow__toggle').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(OUT, `yape-cola-${ancho}.png`), fullPage: true });
  await ctx.close();
}
await browser.close();
console.log('ok', ev);
