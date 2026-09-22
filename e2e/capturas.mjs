// Capturas BEFORE/AFTER de las superficies que toca la auditoría de diseño.
// Dos anchos: 390 (WebKit, el teléfono real del promotor y del comprador) y
// 1440 (Chromium, el escritorio). No mide: retrata. El que mide es
// audit-iphone.mjs.
//
//   node e2e/capturas.mjs before|after
import { webkit, chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { otpSession, sessionCookies, BASE, log, svc } from './lib.mjs';
import { eventoDemo, SUPER, ADMIN, DEMOTEST } from './vistas-paneles.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FASE = (process.argv[2] || 'before').toLowerCase();
const OUT = resolve(ROOT, 'tmp', 'capturas', FASE);
mkdirSync(OUT, { recursive: true });

// Un evento público de una marca de prueba para retratar la página de compra
// sin tocar la de un promotor real.
async function eventoPublico() {
  const { data } = await svc
    .from('events')
    .select('id,slug,name,brands!inner(slug)')
    .eq('is_published', true)
    .eq('brands.slug', 'koko')
    .limit(1);
  return data?.[0] ?? null;
}

const ev = await eventoDemo();
const pub = await eventoPublico();
const VISTAS = [
  ...(pub ? [{ id: 'compra', url: `/b/${pub.brands.slug}/${pub.slug}`, sesion: 'anon' }] : []),
  { id: 'panel-home', url: '/admin', sesion: 'admin' },
  ...(ev ? [{ id: 'panel-evento', url: '/admin/events/' + ev.id, sesion: 'admin' }] : []),
  { id: 'cabina-marcas', url: '/cabina-7k29x', sesion: 'super' },
];

const sesiones = {};
for (const rol of new Set(VISTAS.map((v) => v.sesion))) {
  if (rol === 'anon') continue;
  sesiones[rol] = await otpSession({ super: SUPER, admin: ADMIN }[rol]);
}

const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

for (const [motor, ancho, alto, movil] of [[webkit, 390, 844, true], [chromium, 1440, 900, false]]) {
  const browser = await motor.launch();
  for (const rol of new Set(VISTAS.map((v) => v.sesion))) {
    const ctx = await browser.newContext({
      viewport: { width: ancho, height: alto },
      deviceScaleFactor: movil ? 3 : 1,
      isMobile: movil,
      hasTouch: movil,
      ...(movil ? { userAgent: UA_IPHONE } : {}),
    });
    if (rol !== 'anon') await ctx.addCookies(sessionCookies(sesiones[rol], BASE));
    const page = await ctx.newPage();
    for (const v of VISTAS.filter((x) => x.sesion === rol)) {
      const r = await page.goto(BASE + v.url, { waitUntil: 'networkidle' }).catch(() => null);
      // Las animaciones de entrada duran .42s; se espera a que asienten para
      // que la captura no salga a mitad de un fade.
      await page.waitForTimeout(1200);
      await page.screenshot({ path: resolve(OUT, `${v.id}-${ancho}.png`), fullPage: true });
      log(`${FASE} ${ancho} ${v.id.padEnd(14)} ${r?.status() ?? '?'}`);
    }
    await ctx.close();
  }
  await browser.close();
}
log('capturas en tmp/capturas/' + FASE);
