// Limpieza de los datos que dejaron las pruebas en demotest, CON RESPALDO.
//
//   node supabase/limpiar-datos-de-prueba.mjs            (ensayo: no borra)
//   node supabase/limpiar-datos-de-prueba.mjs --commit   (borra de verdad)
//
// Qué borra: órdenes de la marca demotest cuyo email de comprador tiene la
// forma de los arneses (carga-, e2e-, repro-, gratis-, limite-), con todo lo
// que cuelga de ellas. Nada de otras marcas: el filtro es por brand_id Y por
// patrón de email, no por uno solo.
//
// Por qué existe: las pruebas de carga del 2026-09-22 dejaron ~9000 órdenes y
// ~8000 entradas en una instancia Free que ya había demostrado no tener
// margen. Ese volumen no prueba nada que no esté ya probado y pesa en cada
// consulta del panel.
//
// El orden lo imponen las FK, que son RESTRICT a propósito (ver 0060):
//   ticket_scans → tickets → yape_proofs → stock_reservations → order_items
//   → promo_redemptions → events_log(de esas órdenes) → orders
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { query } from './mgmt.mjs';

const COMMIT = process.argv.includes('--commit');
const PATRONES = ['carga-%', 'e2e-%', 'repro-%', 'gratis-%', 'limite-%'];
const cond = PATRONES.map((p) => `o.buyer_email like '${p}'`).join(' or ');
const FILTRO = `o.brand_id = (select id from brands where slug = 'demotest') and (${cond})`;

const antes = (await query(`select
  (select count(*) from orders o where ${FILTRO}) as ordenes,
  (select count(*) from tickets t where t.order_id in (select o.id from orders o where ${FILTRO})) as tickets,
  (select count(*) from order_items i where i.order_id in (select o.id from orders o where ${FILTRO})) as lineas,
  (select count(*) from events_log l where l.order_id in (select o.id from orders o where ${FILTRO})) as bitacora,
  (select count(*) from orders o join brands b on b.id = o.brand_id where b.slug = 'demotest') as ordenes_demotest_total`))[0];
console.log('a borrar:', JSON.stringify(antes));

// ---------------- respaldo ----------------
// Se guarda ANTES de tocar nada. Es un archivo grande y va a tmp/ (gitignored).
if (COMMIT) {
  mkdirSync('tmp', { recursive: true });
  const respaldo = {};
  respaldo.orders = await query(`select * from orders o where ${FILTRO}`);
  const ids = respaldo.orders.map((o) => `'${o.id}'`).join(',');
  if (ids) {
    respaldo.order_items = await query(`select * from order_items where order_id in (${ids})`);
    respaldo.tickets = await query(`select * from tickets where order_id in (${ids})`);
    respaldo.yape_proofs = await query(`select * from yape_proofs where order_id in (${ids})`);
  }
  const dest = resolve('tmp', `respaldo-pruebas-demotest-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(dest, JSON.stringify(respaldo, null, 1));
  console.log('respaldo:', dest, Object.entries(respaldo).map(([k, v]) => `${k}:${v.length}`).join(' '));
}

// ---------------- borrado ----------------
const PASOS = [
  `delete from ticket_scans where ticket_id in (select t.id from tickets t where t.order_id in (select o.id from orders o where ${FILTRO}))`,
  `delete from tickets where order_id in (select o.id from orders o where ${FILTRO})`,
  `delete from yape_proofs where order_id in (select o.id from orders o where ${FILTRO})`,
  `delete from stock_reservations where order_id in (select o.id from orders o where ${FILTRO})`,
  `delete from order_items where order_id in (select o.id from orders o where ${FILTRO})`,
  `delete from promo_redemptions where order_id in (select o.id from orders o where ${FILTRO})`,
  `delete from events_log where order_id in (select o.id from orders o where ${FILTRO})`,
  `delete from notification_jobs where order_id in (select o.id from orders o where ${FILTRO})`,
  `delete from orders o where ${FILTRO}`,
];

// UNA sola transacción: todo o nada. Con ~9000 órdenes pasó bien el
// 2026-09-23 sobre la base ya recuperada; si algún día el volumen es mayor,
// partirlo por lotes de orders.id antes de correrlo contra una instancia Free.
const cierre = COMMIT ? 'commit;' : 'rollback;';
await query(`begin;\n${PASOS.join(';\n')};\n${cierre}`);

const despues = (await query(`select
  (select count(*) from orders o where ${FILTRO}) as ordenes,
  (select count(*) from tickets t where t.order_id in (select o.id from orders o where ${FILTRO})) as tickets,
  (select count(*) from orders o join brands b on b.id = o.brand_id where b.slug = 'demotest') as ordenes_demotest_total`))[0];
console.log(COMMIT ? 'después del COMMIT:' : 'después del ROLLBACK:', JSON.stringify(despues));

if (!COMMIT) {
  const igual = Number(antes.ordenes) === Number(despues.ordenes);
  console.log(igual ? 'ENSAYO OK: corre entero y no persistió nada.' : '⚠ el ensayo cambió datos, revisar');
  process.exit(igual ? 0 : 1);
}

// ---------------- VACUUM ----------------
// Fuera de transacción, tabla por tabla: devuelve el espacio y actualiza las
// estadísticas del planificador, que después de borrar 9000 filas quedaron
// mintiendo.
for (const t of ['orders', 'order_items', 'tickets', 'events_log', 'stock_reservations', 'yape_proofs', 'notification_jobs']) {
  await query(`vacuum (analyze) public.${t};`);
  console.log('vacuum analyze', t);
}
console.log('listo');
