// Capturas de la cabina del super admin (rediseño 2026-09-26) contra un server
// LOCAL: Inicio, Marcas, Eventos y Salud, a 390 en tema CLARO (el iPhone de
// Paul) y a 1440 en tema OSCURO. Solo lectura, con la sesión real del super
// admin (magic link generado por service role: no envía correo ni cambia la
// contraseña). Mide además lo que el rediseño promete:
//   · ninguna pantalla muestra nombres técnicos (notification_jobs, pending_…);
//   · Eventos no lista eventos de marcas de prueba fuera de su plegable;
//   · Salud ya no dice "0 eventos publicados" (el bug del Promise.all cruzado);
//   · no hay scroll horizontal.
//   node e2e/capturas-cabina.mjs     → tmp/cabina/*.png
import { chromium, webkit } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { svc, BASE, OUT, log, otpSession, sessionCookies } from './lib.mjs';

const DIR = resolve(OUT, '..', 'cabina');
mkdirSync(DIR, { recursive: true });
const R = [];
const check = (n, ok, d = '') => { R.push(ok); log(`${ok ? '✔' : '✘'} ${n}${d ? ' — ' + d : ''}`); };

const { data: sup } = await svc.from('user_profiles').select('user_id').eq('is_super_admin', true).single();
const { data: u } = await svc.auth.admin.getUserById(sup.user_id);
const s = await otpSession(u.user.email);

const RUTAS = [['inicio', '/cabina-7k29x'], ['marcas', '/cabina-7k29x/brands'], ['eventos', '/cabina-7k29x/events'], ['salud', '/cabina-7k29x/salud']];
for (const [ancho, motor, w, h, tema] of [['390', webkit, 390, 844, 'light'], ['1440', chromium, 1440, 900, 'dark']]) {
  const b = await motor.launch();
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: tema });
  await ctx.addCookies(sessionCookies(s, BASE));
  const p = await ctx.newPage();
  for (const [nombre, ruta] of RUTAS) {
    const r = await p.goto(BASE + ruta, { waitUntil: 'load' });
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${DIR}/${nombre}-${ancho}.png`, fullPage: true });
    const txt = await p.locator('main').innerText();
    const scrollX = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`${nombre} ${ancho}: responde y sin scroll horizontal`, r?.status() === 200 && !scrollX, `${r?.status()}`);
    check(`${nombre} ${ancho}: sin nombres técnicos`, !/notification_jobs|pending_yape_review|sold\s*>|oversell/i.test(txt));
    if (nombre === 'eventos') {
      const fuera = await p.locator('main > section .s-event-row__date').allInnerTexts();
      check(`eventos ${ancho}: ninguna marca de prueba fuera del plegable`, !fuera.some((t) => /Demo Test/i.test(t)), `${fuera.length} filas visibles`);
    }
    if (nombre === 'salud') check(`salud ${ancho}: ya no repite "Eventos publicados" (y el registro se lee)`, !/Eventos publicados/.test(txt) && /Lo que hiciste dentro de marcas/.test(txt));
    if (nombre === 'inicio') check(`inicio ${ancho}: dice qué te toca y cómo va`, /Por resolver|Todo en orden/.test(await p.locator('main').innerHTML()) && /Paquetes vendidos/.test(txt) && /Eventos a la venta ahora/.test(txt));
  }
  await b.close();
}
const ok = R.filter(Boolean).length;
log(`${ok === R.length ? '✅' : '❌'} ${ok}/${R.length}`);
process.exit(ok === R.length ? 0 : 1);
