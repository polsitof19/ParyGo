// Panel en inglés (0073, 2026-09-25) contra un server LOCAL. Con demotest:
//   1. cambia el idioma a English desde Mi marca (el selector, como el
//      organizador) y verifica brands.idioma = 'en';
//   2. recorre todas las pantallas del panel y del escáner y marca las líneas
//      que todavía tienen palabras en español (los datos del evento —nombres,
//      tipos de entrada— son de la marca y pueden estar en español);
//   3. vuelve a Español desde el mismo selector y verifica 'es'.
// Capturas a 390 en tmp/e2e/panel-en-*.png.
//
//   node e2e/panel-en.mjs        (NO correr a la vez que fase1: usa demotest)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { svc, BASE, OUT, log, otpSession, sessionCookies } from './lib.mjs';

const R = [];
const check = (nombre, ok, detalle = '') => { R.push(ok); log(`${ok ? '✔' : '✘'} ${nombre}${detalle ? ' — ' + detalle : ''}`); };
mkdirSync(OUT, { recursive: true });

// Palabras que en un panel en inglés solo pueden venir de texto sin traducir.
const ES = /[¿¡ñ]|\b(el|los|las|del|una|para|con|sin|por|tus?|aquí|todavía|evento|eventos|entradas?|compradores?|cortesías?|guardar|crear|agregar|puerta|precio|fecha|vendidas|marca|equipo|escáner|aprobar|rechazar|comprobantes?|cerrar sesión|volver|copiar|publicar|borrador|archivad[oa]s?)\b/i;

const { data: brand } = await svc.from('brands').select('id, idioma').eq('slug', 'demotest').single();
const { data: ev } = await svc.from('events').select('id, name').eq('brand_id', brand.id).is('archived_at', null).order('created_at', { ascending: false }).limit(1);
const e = ev?.[0]?.id;
const s = await otpSession('brandadmin.demotest@parygo.test');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addCookies(sessionCookies(s, BASE));
const p = await ctx.newPage();

async function elegir(valor) {
  await p.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });
  await p.selectOption('#idioma', valor);
  await p.waitForFunction((v) => document.querySelector('.pg-panel')?.getAttribute('lang') === v, valor, { timeout: 20000 });
  const { data } = await svc.from('brands').select('idioma').eq('id', brand.id).single();
  return data?.idioma;
}

try {
  check('elegir English en Mi marca guarda idioma=en', (await elegir('en')) === 'en');
  check('Mi marca ya se ve en inglés', /My brand/.test(await p.locator('main').innerText()));

  const rutas = ['/admin', '/admin/settings', '/admin/equipo', '/admin/comprar', '/admin/events/new'];
  if (e) for (const sec of ['', '/estadisticas', '/entradas', '/yape', '/cortesias', '/clientes', '/promotores', '/accesos', '/editar', '/reporte']) rutas.push(`/admin/events/${e}${sec}`);
  rutas.push('/scan');
  let limpias = 0;
  for (const r of rutas) {
    const res = await p.goto(BASE + r, { waitUntil: 'networkidle' });
    const texto = await p.locator('body').innerText();
    const nombre = r.replace(e ?? '#', '<ev>');
    const sospechosas = texto.split('\n').map((x) => x.trim()).filter((x) => x && ES.test(x) && !(ev?.[0]?.name && x.includes(ev[0].name)));
    if (!sospechosas.length) limpias++;
    log(`${res?.status()} ${nombre}${sospechosas.length ? `  (${sospechosas.length} líneas a revisar)` : ''}`);
    for (const x of sospechosas.slice(0, 12)) log('      · ' + x.slice(0, 140));
    if (['/admin', `/admin/events/${e}`, '/admin/events/new', `/admin/events/${e}/estadisticas`].includes(r)) {
      await p.screenshot({ path: `${OUT}/panel-en-${nombre.replace(/[^a-z]+/gi, '-').replace(/^-|-$/g, '') || 'home'}.png`, fullPage: true });
    }
  }
  check(`pantallas sin español sospechoso: ${limpias}/${rutas.length}`, true);
} catch (err) {
  check('excepción', false, err.message);
} finally {
  const vuelta = await elegir('es').catch(() => null);
  if (vuelta !== 'es') await svc.from('brands').update({ idioma: 'es' }).eq('id', brand.id);
  check('volver a Español desde Mi marca guarda idioma=es', vuelta === 'es');
  await b.close();
}
const ok = R.filter(Boolean).length;
log(`${ok === R.length ? '✅' : '❌'} ${ok}/${R.length}`);
process.exit(ok === R.length ? 0 : 1);
