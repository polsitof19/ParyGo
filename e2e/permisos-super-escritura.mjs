// PERMISOS del modo edición del super admin — con SESIONES REALES, por HTTP.
//
//   node e2e/permisos-super-escritura.mjs     (server local en :3001)
//
// Por qué así y no con service-role: una prueba hecha con la llave de servicio
// saltea todas las guardas y no prueba nada. Acá cada caso manda el MISMO
// pedido de la server action —capturado del navegador, con su action id y sus
// cabeceras— cambiando SOLO las cookies de sesión. Es exactamente lo que podría
// hacer alguien con curl.
//
// Los tres casos que importan:
//   1. el organizador de OTRA marca no puede escribir en la marca ajena;
//   2. el super admin DENTRO de la marca, con el modo edición APAGADO, tampoco
//      (esto es lo que garantiza que "entrar a mirar" no toque nada);
//   3. con el modo ENCENDIDO sí puede, y queda auditado con su nombre.
//
// Además: la cookie de edición NO habilita nada por sí sola (caso 4) y el modo
// encendido en una marca no sirve para escribir en OTRA (caso 5).
import { chromium } from 'playwright';
import { svc, otpSession, sessionCookies, BASE, log, env } from './lib.mjs';
import { SUPER, ADMIN, DEMOTEST } from './vistas-paneles.mjs';

const fallos = [];
const check = (nombre, cond, detalle = '') => {
  if (!cond) fallos.push(nombre);
  log(`${cond ? '✔' : '✘'} ${nombre}${detalle ? ' — ' + String(detalle).slice(0, 180) : ''}`);
};

const STAMP = String(Date.now()).slice(-6);
const { data: marca } = await svc.from('brands').select('id, archived_at').eq('id', DEMOTEST).single();
const estabaArchivada = !!marca.archived_at;
if (estabaArchivada) await svc.from('brands').update({ archived_at: null }).eq('id', marca.id);

// Evento DESECHABLE de demotest: es el que se va a intentar editar.
const inicio = new Date(Date.now() + 20 * 86400000);
const { data: ev, error: evErr } = await svc.from('events').insert({
  brand_id: marca.id, slug: `e2e-permisos-${STAMP}`, name: `E2E Permisos ${STAMP}`,
  starts_at: inicio.toISOString(), ends_at: new Date(inicio.getTime() + 6 * 3600000).toISOString(),
  venue_name: 'Local E2E', is_published: false, min_age: 18,
}).select('id, name').single();
if (evErr) throw new Error('evento: ' + evErr.message);

// Un evento de OTRA marca para el caso cruzado. Es una marca DESECHABLE creada
// acá (is_test, archivada, evento sin publicar) y borrada al final: si alguna
// guarda fallara, lo que se renombra es esto y no un evento en venta de un
// cliente real (antes apuntaba a standly-en-cocos, de Tío Code).
const { data: marcaAjena, error: maErr } = await svc.from('brands').insert({
  slug: `e2e-ajena-${STAMP}`, name: `E2E Ajena ${STAMP}`, is_test: true, archived_at: new Date().toISOString(),
}).select('id').single();
if (maErr) throw new Error('marca ajena: ' + maErr.message);
const { data: evAjeno, error: eaErr } = await svc.from('events').insert({
  brand_id: marcaAjena.id, slug: `e2e-ajeno-${STAMP}`, name: `E2E Ajeno ${STAMP}`,
  starts_at: inicio.toISOString(), is_published: false,
}).select('id, name, brand_id, starts_at').single();
if (eaErr) throw new Error('evento ajeno: ' + eaErr.message);

const superSess = await otpSession(SUPER);
const admSess = await otpSession(ADMIN); // brand_admin de demotest

// ---------------------------------------------------------------- captura
// Se abre el panel como super admin, se entra a demotest, se enciende el modo
// edición y se guarda el formulario del evento: de ahí sale el pedido real.
const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies(sessionCookies(superSess, BASE));
const page = await ctx.newPage();
// "Entrar a la marca" ya lo cubre el E2E (paso A) y la ficha de demotest tarda
// 23s en local por sus 60+ eventos. Acá interesa el INTERRUPTOR: se pone la
// cookie de impersonación —la misma que setea esa acción— y se va al panel.
await ctx.addCookies([
  { name: 'parygo_imp', value: marca.id, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
]);
await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(2000);
const franjaLectura = (await page.locator('.imp-banner').innerText().catch(() => '')).replace(/\s+/g, ' ');
check('al entrar a la marca la franja dice SOLO LECTURA', /SOLO LECTURA/i.test(franjaLectura), franjaLectura.slice(0, 90));

await page.getByRole('button', { name: /Editar como super admin/i }).click();
// La acción redirige a /admin y en local ese render tarda más que un sleep fijo.
await page.locator('.imp-banner--edit').waitFor({ timeout: 60000 }).catch(() => {});
const franjaEdicion = (await page.locator('.imp-banner').innerText().catch(() => '')).replace(/\s+/g, ' ');
check('con el modo encendido la franja avisa que está EDITANDO', /EDITANDO/i.test(franjaEdicion), franjaEdicion.slice(0, 110));

await page.goto(`${BASE}/admin/events/${ev.id}/editar`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.locator('#ev-name').waitFor({ timeout: 20000 }).catch(() => {});
const nombreNuevo = `${ev.name} EDITADO`;
await page.fill('#ev-name', nombreNuevo).catch(async () => {
  await page.locator('input[name="name"]').first().fill(nombreNuevo);
});
const capturaP = page.waitForRequest(
  (q) => q.method() === 'POST' && !!q.headers()['next-action'] && (q.postData() || '').includes('name'),
  { timeout: 30000 }
);
await page.getByRole('button', { name: /Guardar/i }).first().click();
const captura = await capturaP;
await page.waitForTimeout(2500);
const plantilla = { url: captura.url(), headers: captura.headers(), body: captura.postData() };

// ¿El guardado del caso 3 funcionó? (es el camino bueno)
const { data: evTrasEdicion } = await svc.from('events').select('name').eq('id', ev.id).single();
check('CASO 3 · super admin CON modo edición: la escritura pasa', evTrasEdicion.name === nombreNuevo, evTrasEdicion.name);

const { data: auditoria } = await svc
  .from('events_log').select('type, payload, actor_user_id')
  .eq('event_id', ev.id).eq('type', 'super_admin_write').order('created_at', { ascending: false }).limit(1);
const fila = auditoria?.[0];
check('CASO 3 · queda auditada con quién, sobre qué marca y en qué modo',
  Boolean(fila) && fila.payload?.modo === 'edicion' && fila.payload?.on_behalf_of === marca.id && Boolean(fila.actor_user_id),
  JSON.stringify(fila?.payload ?? null));

await browser.close();

// ------------------------------------------------- repetir el MISMO pedido
const cookiesDe = (sess, extra = {}) => {
  const base = sessionCookies(sess, BASE).map((c) => `${c.name}=${c.value}`);
  for (const [k, v] of Object.entries(extra)) base.push(`${k}=${v}`);
  return base.join('; ');
};
const CABECERAS = Object.fromEntries(
  Object.entries(plantilla.headers).filter(([k]) =>
    ['next-action', 'next-router-state-tree', 'content-type', 'accept'].includes(k))
);

async function intentar(nombreCaso, cookie, { eventId = ev.id, nombre } = {}) {
  // El cuerpo es FormData serializada: se reemplaza el id del evento y el
  // nombre dentro del texto crudo, que es como viajaría de verdad.
  let cuerpo = plantilla.body;
  if (eventId !== ev.id) cuerpo = cuerpo.split(ev.id).join(eventId);
  if (nombre) cuerpo = cuerpo.replace(/EDITADO/g, nombre);
  const r = await fetch(plantilla.url, { method: 'POST', headers: { ...CABECERAS, cookie }, body: cuerpo });
  const txt = await r.text();
  return { status: r.status, negado: /No tienes permiso|No autorizado|Sin permiso/i.test(txt), txt };
}

// CASO 1 — organizador de OTRA marca contra el evento de Tío Code.
if (evAjeno) {
  const antes = evAjeno.name;
  const r1 = await intentar('cruzado', cookiesDe(admSess), { eventId: evAjeno.id, nombre: 'INTRUSO' });
  const { data: despues } = await svc.from('events').select('name').eq('id', evAjeno.id).single();
  check('CASO 1 · organizador de otra marca NO puede escribir en la marca ajena',
    r1.negado && despues.name === antes, `negado=${r1.negado} nombre="${despues.name}"`);
} else {
  check('CASO 1 · evento ajeno disponible para la prueba', false, 'no se pudo crear el evento ajeno');
}

// CASO 2 — super admin DENTRO de la marca, modo edición APAGADO.
{
  const marcador = `SIN-MODO-${STAMP}`;
  const r2 = await intentar('sin modo', cookiesDe(superSess, { parygo_imp: marca.id }), { nombre: marcador });
  const { data: despues } = await svc.from('events').select('name').eq('id', ev.id).single();
  check('CASO 2 · super admin viendo la marca SIN modo edición: no escribe',
    r2.negado && !despues.name.includes(marcador), `negado=${r2.negado} nombre="${despues.name}"`);
}

// CASO 4 — la cookie de edición SOLA (sin ser super admin) no habilita nada.
{
  const marcador = `FORJADA-${STAMP}`;
  const r4 = await intentar('cookie forjada', cookiesDe(admSess, { parygo_imp: marca.id, parygo_imp_edit: marca.id }),
    { eventId: evAjeno?.id ?? ev.id, nombre: marcador });
  const objetivo = evAjeno?.id ?? ev.id;
  const { data: despues } = await svc.from('events').select('name').eq('id', objetivo).single();
  check('CASO 4 · un brand_admin que FORJA las dos cookies no gana nada',
    r4.negado && !despues.name.includes(marcador), `negado=${r4.negado} nombre="${despues.name}"`);
}

// CASO 5 — modo encendido en UNA marca no sirve para escribir en OTRA.
if (evAjeno) {
  const antes = evAjeno.name;
  const r5 = await intentar('otra marca', cookiesDe(superSess, { parygo_imp: marca.id, parygo_imp_edit: marca.id }),
    { eventId: evAjeno.id, nombre: 'CRUZADO' });
  const { data: despues } = await svc.from('events').select('name').eq('id', evAjeno.id).single();
  check('CASO 5 · el modo edición de una marca no escribe en OTRA marca',
    r5.negado && despues.name === antes, `negado=${r5.negado} nombre="${despues.name}"`);
}

// CASO 6 — modo edición encendido en demotest y después "entra" a la marca
// ajena: la cookie de edición es de OTRA marca, así que la ajena queda en solo
// lectura. (Antes la cookie valía '1' y pasaba de una marca a la siguiente.)
{
  const antes = evAjeno.name;
  const r6 = await intentar('edición de otra marca', cookiesDe(superSess, { parygo_imp: marcaAjena.id, parygo_imp_edit: marca.id }),
    { eventId: evAjeno.id, nombre: 'ARRASTRADO' });
  const { data: despues } = await svc.from('events').select('name').eq('id', evAjeno.id).single();
  check('CASO 6 · el modo edición encendido en una marca no se arrastra a la siguiente',
    r6.negado && despues.name === antes, `negado=${r6.negado} nombre="${despues.name}"`);
}

// ---------------------------------------------------------------- limpieza
await svc.from('events').update({ archived_at: new Date().toISOString() }).eq('id', ev.id);
await svc.from('events_log').delete().eq('brand_id', marcaAjena.id);
await svc.from('events').delete().eq('id', evAjeno.id);
const { error: borrarAjena } = await svc.from('brands').delete().eq('id', marcaAjena.id);
if (borrarAjena) log('⚠ no se pudo borrar la marca ajena', marcaAjena.id, borrarAjena.message);
if (estabaArchivada) await svc.from('brands').update({ archived_at: new Date().toISOString() }).eq('id', marca.id);
void env;
log(`\n${fallos.length ? 'FALLAS: ' + fallos.join(' | ') : 'TODO VERDE'}`);
process.exit(fallos.length ? 1 : 0);
