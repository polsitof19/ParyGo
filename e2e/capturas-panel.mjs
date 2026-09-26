// Capturas del panel del organizador (demotest) a 390 y 1440. Solo lectura.
//   node e2e/capturas-panel.mjs     → tmp/capturas/panel/<vista>-<ancho>.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { otpSession, sessionCookies, BASE, log, svc } from './lib.mjs';
import { ADMIN, DEMOTEST } from './vistas-paneles.mjs';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tmp', 'capturas', 'panel');
mkdirSync(OUT, { recursive: true });
const { data: evs } = await svc.from('events').select('id').eq('brand_id', DEMOTEST).eq('is_published', true).is('archived_at', null).order('created_at', { ascending: false }).limit(1);
const e = evs?.[0]?.id;
const VISTAS = [
  ['eventos', '/admin'], ['crear', '/admin/events/new'], ['mi-marca', '/admin/settings'], ['equipo', '/admin/equipo'],
  ...(e ? [['ev-resumen', `/admin/events/${e}`], ['ev-evento', `/admin/events/${e}/editar`], ['ev-personas', `/admin/events/${e}/clientes`], ['ev-promotores', `/admin/events/${e}/promotores`], ['ev-puerta', `/admin/events/${e}/accesos`]] : []),
  ['escaner', '/scan'],
];
const sess = await otpSession(ADMIN);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
for (const ancho of [390, 1440]) {
  const movil = ancho === 390;
  const ctx = await browser.newContext({ viewport: { width: ancho, height: movil ? 844 : 900 }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil, ...(movil ? { userAgent: UA } : {}), permissions: ['camera'] });
  await ctx.addCookies(sessionCookies(sess, BASE));
  const page = await ctx.newPage();
  for (const [id, url] of VISTAS) {
    const r = await page.goto(BASE + url, { waitUntil: 'load', timeout: 90000 }).catch(() => null);
    await page.waitForTimeout(1500);
    // Viewport (no página completa): así se ve la barra de abajo donde va.
    await page.screenshot({ path: resolve(OUT, `${id}-${ancho}.png`), fullPage: !movil });
    log(`${ancho} ${id.padEnd(14)} ${r?.status() ?? '?'} ${page.url().replace(BASE, '')}`);
  }
  await ctx.close();
}
await browser.close();
