// ENCONTRABILIDAD MEDIDA — cuántos clics hay desde /admin hasta cada acción
// frecuente del organizador, clickeando de verdad (no leyendo el DOM).
//
//   buscar comprador · reenviar entrada · exportar asistentes · ventas por promotor
//
// Camino: /admin → fila de un evento ACTIVO (clic 1) → la acción visible en el
// Resumen (clic 2). Cada acción tiene que quedar LISTA para usarse:
//   buscar     → /clientes con el campo de búsqueda enfocado
//   reenviar   → /clientes enfocado + la instrucción de "Reenviar QR"
//   exportar   → empieza la descarga del CSV
//   promotores → /promotores cargada
// Corre en WebKit 390 (el teléfono del promotor) y Chromium 1440.
//
//   node e2e/clics-paneles.mjs          (server local en :3001, ver README)
import { webkit, chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { otpSession, sessionCookies, BASE, log } from './lib.mjs';
import { ADMIN } from './vistas-paneles.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'tmp', 'paneles-moderno');
mkdirSync(OUT, { recursive: true });

const ACCIONES = [
  { id: 'buscar', texto: 'Buscar comprador', listo: async (p) => p.url().includes('/clientes') && (await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Buscar comprador')) },
  { id: 'reenviar', texto: 'Reenviar entrada', listo: async (p) => p.url().includes('/clientes') && (await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Buscar comprador')) && (await p.getByText('Reenviar QR»').count()) > 0 },
  { id: 'exportar', texto: 'Exportar asistentes', descarga: true },
  { id: 'promotores', texto: 'Ventas por promotor', listo: async (p) => /\/promotores$/.test(new URL(p.url()).pathname) },
];

const sesion = await otpSession(ADMIN);
const resultados = [];

for (const [motor, ancho, alto, movil] of [[webkit, 390, 844, true], [chromium, 1440, 900, false]]) {
  const browser = await motor.launch();
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, isMobile: movil, hasTouch: movil, acceptDownloads: true });
  await ctx.addCookies(sessionCookies(sesion, BASE));
  const page = await ctx.newPage();

  for (const a of ACCIONES) {
    let clics = 0;
    await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
    // Clic 1: la fila del primer evento activo de la lista.
    await page.locator('a.a-evcard').first().click();
    clics++;
    await page.waitForURL(/\/admin\/events\/[^/]+$/);
    // La acción tiene que estar A LA VISTA sin abrir nada (sin nav plegado).
    const accion = page.locator('main .s-act, .s-wrap .s-act').filter({ hasText: a.texto }).first();
    // Espera a que el Resumen termine de renderizar (la navegación es de
    // cliente y primero pinta el skeleton); si la acción no aparece, no está.
    const visible = await accion.waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false);
    let ok = false;
    if (a.descarga) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }).catch(() => null), accion.click()]);
      clics++;
      ok = Boolean(dl && /\.csv$/i.test(dl.suggestedFilename()));
    } else {
      await accion.click();
      clics++;
      if (a.id !== 'promotores') await page.locator('input[aria-label="Buscar comprador"]').waitFor({ timeout: 15000 }).catch(() => {});
      else await page.waitForURL(/\/promotores$/, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(300);
      ok = await a.listo(page);
    }
    resultados.push({ ancho, accion: a.id, clics, visibleSinAbrirNada: visible, lista: ok, url: page.url().replace(BASE, '') });
    log(`${ancho} ${a.id.padEnd(11)} clics:${clics} visible:${visible} lista:${ok}`);
  }
  await ctx.close();
  await browser.close();
}

writeFileSync(resolve(OUT, 'clics.json'), JSON.stringify(resultados, null, 2));
const mal = resultados.filter((r) => r.clics > 2 || !r.lista || !r.visibleSinAbrirNada);
log(mal.length ? `FALLA: ${mal.length} acciones fuera de regla` : `OK: ${resultados.length}/${resultados.length} acciones a ≤2 clics desde /admin`);
process.exit(mal.length ? 1 : 0);
