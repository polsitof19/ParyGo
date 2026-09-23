// Smoke de PRODUCCIÓN del panel ordenado y del escáner, SOLO LECTURA, sobre la
// cuenta de DEMOTEST (brandadmin.demotest). Ningún clic que escriba: navega y
// mide. Falla si la página dispara una escritura (POST que no sea el beacon de
// Cloudflare o un refresco RSC de solo lectura).
//   node e2e/smoke-prod-panel.mjs       capturas en tmp/prod-panel/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { otpSession, sessionCookies } from './lib.mjs';

const BASE = 'https://app.parygo.com';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tmp', 'prod-panel');
mkdirSync(OUT, { recursive: true });
let fallas = 0;
const check = (n, ok, d = '') => { if (!ok) fallas += 1; console.log(`${ok ? '✔' : '✘'} ${n}${d ? ' — ' + String(d).slice(0, 200) : ''}`); };
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

// 1) Escáner sin sesión → login con next=/scan
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/scan`, { waitUntil: 'load' });
  await p.waitForURL(/\/login/, { timeout: 20000 }).catch(() => {});
  const sub = await p.locator('.auth-sub').innerText().catch(() => '');
  check('escáner sin sesión → /login?next=/scan', /\/login\?next=(%2F|\/)scan/.test(p.url()), p.url());
  check('el login dice que es para abrir el escáner', /abrir el escáner/.test(sub), sub);
  await p.goto(`${BASE}/puerta`, { waitUntil: 'load' });
  check('/puerta ofrece entrar con email al escáner', (await p.locator('a[href="/login?next=/scan"]').count()) === 1);
  await ctx.close();
}

// 2) Panel y escáner con sesión real de demotest (solo lectura)
const sess = await otpSession('brandadmin.demotest@parygo.test');
for (const ancho of [390, 1440]) {
  const movil = ancho === 390;
  const ctx = await browser.newContext({ viewport: { width: ancho, height: movil ? 844 : 900 }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil, permissions: ['camera'] });
  await ctx.addCookies(sessionCookies(sess, BASE));
  const p = await ctx.newPage();
  const escrituras = [];
  p.on('request', (r) => {
    if (r.method() === 'GET' || r.method() === 'HEAD' || r.url().includes('/cdn-cgi/rum')) return;
    if (r.headers()['next-action']) escrituras.push(`${r.method()} ${r.url()}`);
  });
  await p.goto(`${BASE}/admin`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const sel = movil ? '.s-tabbar a' : '.s-topbar .s-nav a';
  const secciones = (await p.locator(sel).allInnerTexts()).map((t) => t.trim());
  check(`${ancho} · panel en 4 secciones (${movil ? 'barra de abajo' : 'arriba'})`, secciones.join('|') === 'Eventos|Escáner|Equipo|Mi marca', secciones.join(' | '));
  await p.screenshot({ path: resolve(OUT, `eventos-${ancho}.png`), fullPage: !movil });
  const primero = p.locator('a.a-evcard').first();
  if (await primero.count()) {
    await primero.click();
    await p.waitForURL(/\/admin\/events\//, { timeout: 30000 });
    await p.waitForTimeout(1500);
    const menu = (await p.locator('.a-menu__t').allInnerTexts()).map((t) => t.trim());
    check(`${ancho} · evento = menú con Estadísticas primero`, menu[0] === 'Estadísticas' && menu[1] === 'Entradas' && menu.length >= 7, menu.join(' | '));
    await p.screenshot({ path: resolve(OUT, `evento-${ancho}.png`), fullPage: !movil });
    await p.goto(p.url().replace(/(\/admin\/events\/[0-9a-f-]+).*/, '$1/entradas'), { waitUntil: 'load' });
    check(`${ancho} · Entradas: sección propia`, (await p.locator('#entradas').count()) === 1);
  }
  await p.goto(`${BASE}/scan`, { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  const h1 = (await p.locator('h1').first().innerText().catch(() => '')).trim();
  check(`${ancho} · el escáner abre (sesión de organizador)`, /Escanear entradas/.test(h1) && /\/scan$/.test(p.url()), `${p.url()} · ${h1}`);
  check(`${ancho} · botón "Panel" para volver`, (await p.locator('a.k-panel[href="/admin"]').count()) === 1);
  await p.screenshot({ path: resolve(OUT, `escaner-${ancho}.png`) });
  check(`${ancho} · ninguna escritura disparada`, escrituras.length === 0, escrituras.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(fallas ? `✘ ${fallas} falla(s)` : '✔ smoke OK');
process.exit(fallas ? 1 : 0);
