// Capturas del super admin a 390 y 1440. Solo lectura.
//   node e2e/capturas-super.mjs     → tmp/capturas/super/<vista>-<ancho>.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { otpSession, sessionCookies, BASE } from './lib.mjs';
import { SUPER } from './vistas-paneles.mjs';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tmp', 'capturas', 'super');
mkdirSync(OUT, { recursive: true });
const VISTAS = [
  ['marcas', '/cabina-7k29x'], ['ficha', '/cabina-7k29x/brands/demotest'], ['eventos', '/cabina-7k29x/events'],
  ['solicitudes', '/cabina-7k29x/solicitudes'], ['salud', '/cabina-7k29x/salud'],
];
const sess = await otpSession(SUPER);
const browser = await chromium.launch();
for (const ancho of [390, 1440]) {
  const movil = ancho === 390;
  const ctx = await browser.newContext({ viewport: { width: ancho, height: movil ? 844 : 900 }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil });
  await ctx.addCookies(sessionCookies(sess, BASE));
  const page = await ctx.newPage();
  for (const [id, url] of VISTAS) {
    await page.goto(BASE + url, { waitUntil: 'load', timeout: 90000 }).catch(() => null);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: resolve(OUT, `${id}-${ancho}.png`), fullPage: !movil });
  }
  await ctx.close();
}
await browser.close();
console.log('ok', OUT);
