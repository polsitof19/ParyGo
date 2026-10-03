// BORRADO EN CASCADA DE UNA MARCA — producción. Irreversible salvo respaldo.
//
//   node supabase/borrar-marca.mjs <slug> [--commit]
//
// Sin --commit hace el ENSAYO: corre TODA la transacción y la revierte
// (BEGIN … ROLLBACK), y después vuelve a contar para probar que no persistió
// nada. Con --commit hace lo mismo pero confirma, y recién entonces toca
// storage y las cuentas de auth.
//
// Por qué a mano y no ON DELETE CASCADE: las FK que importan son RESTRICT
// (tickets→orders, orders→events, events→brands). Eso es a propósito — impide
// que un borrado accidental se lleve entradas vendidas — así que el orden lo
// tiene que poner este script:
//     ticket_scans → tickets → yape_proofs → orders → events → resto → brand
//
// PROTECCIONES
//   · lista negra dura: code, hoesky, demotest NUNCA se borran desde acá.
//   · respaldo a tmp/borrado-<slug>-<fecha>.json ANTES de tocar nada.
//   · una cuenta de auth se borra SOLO si no le queda ninguna otra marca.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './mgmt.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, 'apps/web/.env.local'), 'utf8')
    .split('\n').map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const INTOCABLES = new Set(['code', 'hoesky', 'demotest']);
const [slug, ...flags] = process.argv.slice(2);
const COMMIT = flags.includes('--commit');
if (!slug) throw new Error('uso: node supabase/borrar-marca.mjs <slug> [--commit]');
if (INTOCABLES.has(slug)) throw new Error(`"${slug}" está en la lista negra de este script y no se borra por acá`);

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const log = (...a) => console.log(...a);

// ---------- 0. ¿Qué hay? ----------
const [marca] = await query(`select id, slug, name, archived_at from brands where slug = ${q(slug)}`);
if (!marca) throw new Error(`no existe la marca ${slug}`);
const B = q(marca.id);

const CONTEO = `select
  (select count(*) from brands where id = ${B}) as marcas,
  (select count(*) from events where brand_id = ${B}) as eventos,
  (select count(*) from orders where brand_id = ${B}) as ordenes,
  (select count(*) from tickets where brand_id = ${B}) as tickets,
  (select count(*) from yape_proofs where brand_id = ${B}) as comprobantes,
  (select count(*) from ticket_scans where brand_id = ${B}) as escaneos,
  (select count(*) from brand_members where brand_id = ${B}) as miembros,
  (select count(*) from promo_codes where brand_id = ${B}) as promos,
  (select count(*) from access_requests where brand_id = ${B}) as solicitudes`;

const antes = (await query(CONTEO))[0];
log(`\n== ${marca.name} (${slug}) ==`);
log('antes:', JSON.stringify(antes));

// ---------- 1. Respaldo ----------
const TABLAS = ['brands', 'brand_members', 'events', 'ticket_types', 'ticket_type_price_phases', 'orders', 'order_items', 'tickets', 'ticket_scans', 'yape_proofs', 'promo_codes', 'promo_redemptions', 'validator_codes', 'access_requests', 'events_log'];
const POR_MARCA = { brands: 'id', ticket_types: null, ticket_type_price_phases: null, order_items: null };
const respaldo = { marca, fecha: new Date().toISOString(), tablas: {} };
for (const t of TABLAS) {
  const where = t === 'brands' ? `id = ${B}`
    : t === 'ticket_types' ? `event_id in (select id from events where brand_id = ${B})`
      : t === 'ticket_type_price_phases' ? `ticket_type_id in (select id from ticket_types where event_id in (select id from events where brand_id = ${B}))`
        : t === 'order_items' ? `order_id in (select id from orders where brand_id = ${B})`
          : `brand_id = ${B}`;
  respaldo.tablas[t] = await query(`select * from ${t} where ${where}`);
}
mkdirSync(resolve(ROOT, 'tmp'), { recursive: true });
const dest = resolve(ROOT, 'tmp', `borrado-${slug}-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(dest, JSON.stringify(respaldo, null, 1));
log('respaldo:', dest, Object.entries(respaldo.tablas).map(([k, v]) => `${k}:${v.length}`).join(' '));

// ---------- 2. Cuentas de auth que quedarían huérfanas ----------
const huerfanos = await query(`select u.id, u.email from auth.users u
  where u.id in (select user_id from brand_members where brand_id = ${B})
    and not exists (select 1 from brand_members m2 where m2.user_id = u.id and m2.brand_id <> ${B})`);
const compartidos = await query(`select distinct u.email from auth.users u
  join brand_members m on m.user_id = u.id and m.brand_id = ${B}
  where exists (select 1 from brand_members m2 where m2.user_id = u.id and m2.brand_id <> ${B})`);
log('cuentas a borrar:', huerfanos.map((u) => u.email).join(', ') || '(ninguna)');
log('cuentas que SOBREVIVEN (están en otra marca):', compartidos.map((u) => u.email).join(', ') || '(ninguna)');

// ---------- 3. La transacción ----------
// events_log y ticket_resend_attempts son bitácora: sus FK son SET NULL y las
// filas quedan (sin marca). Se borran igual las de esta marca para no dejar
// registros colgando de un evento que ya no existe.
const BORRADOS = [
  `delete from ticket_scans where brand_id = ${B}`,
  `delete from events_log where brand_id = ${B}`,
  `delete from ticket_resend_attempts where brand_id = ${B}`,
  `delete from tickets where brand_id = ${B}`,
  `delete from yape_proofs where brand_id = ${B}`,
  `delete from stock_reservations where order_id in (select id from orders where brand_id = ${B})`,
  `delete from promo_redemptions where brand_id = ${B}`,
  `delete from order_items where order_id in (select id from orders where brand_id = ${B})`,
  `delete from orders where brand_id = ${B}`,
  `delete from promo_codes where brand_id = ${B}`,
  `delete from ticket_types where event_id in (select id from events where brand_id = ${B})`,
  `delete from events where brand_id = ${B}`,
  `delete from access_requests where brand_id = ${B}`,
  `delete from validator_codes where brand_id = ${B}`,
  `delete from notification_jobs where brand_id = ${B}`,
  `delete from ref_clicks where brand_id = ${B}`,
  `delete from brand_members where brand_id = ${B}`,
  `delete from brands where id = ${B}`,
];
const cierre = COMMIT ? 'COMMIT;' : 'ROLLBACK;';
// El conteo va DESPUÉS del cierre a propósito: en el ensayo prueba que el
// rollback revirtió todo, y en el real que no quedó nada.
const despues = (await query(`BEGIN;\n${BORRADOS.join(';\n')};\n${cierre}\n${CONTEO}`))[0];
log(COMMIT ? 'después del COMMIT:' : 'después del ROLLBACK:', JSON.stringify(despues));

if (!COMMIT) {
  const igual = JSON.stringify(antes) === JSON.stringify(despues);
  log(igual ? '\nENSAYO OK: la transacción corre entera y NO persistió nada.' : '\n⚠ ENSAYO RARO: los conteos cambiaron. NO correr con --commit.');
  process.exit(igual ? 0 : 1);
}

const vacio = Object.values(despues).every((v) => Number(v) === 0);
if (!vacio) { log('\n⚠ quedó algo sin borrar; NO se tocan storage ni cuentas.'); process.exit(1); }

// ---------- 4. Storage ----------
for (const [bucket, prefijo] of [['brand-assets', slug], ['yape-proofs', marca.id]]) {
  const { data: files } = await svc.storage.from(bucket).list(prefijo, { limit: 1000 });
  const rutas = (files ?? []).map((f) => `${prefijo}/${f.name}`);
  if (rutas.length) {
    const { error } = await svc.storage.from(bucket).remove(rutas);
    log(`storage ${bucket}/${prefijo}: ${error ? 'ERROR ' + error.message : rutas.length + ' borrados'}`);
  } else log(`storage ${bucket}/${prefijo}: vacío`);
}

// ---------- 5. Cuentas ----------
for (const u of huerfanos) {
  const { error } = await svc.auth.admin.deleteUser(u.id);
  log(`auth ${u.email}: ${error ? 'ERROR ' + error.message : 'borrada'}`);
}
log('\nlisto.');
