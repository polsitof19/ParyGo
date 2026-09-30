// 0077: nadie con JWT escribe directo en orders / tickets / yape_proofs /
// promo_codes. Permisos por JWT REAL (dueño y puerta de demotest) y anon;
// con service-role el test no probaría nada. Cada intento escribe el MISMO
// valor que ya tiene la fila: si el permiso siguiera abierto, no cambia nada.
//   node e2e/permisos-0077.mjs
import { createClient } from '@supabase/supabase-js';
import { svc, anon, env, log, otpSession } from './lib.mjs';

let fallas = 0;
const check = (nombre, ok, detalle = '') => {
  if (!ok) fallas++;
  log(`${ok ? '✔' : '✘'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

const conJwt = async (email) => {
  const s = await otpSession(email);
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.access_token}` } },
  });
};

const { data: brand } = await svc.from('brands').select('id').eq('slug', 'demotest').single();
const fila = async (tabla, cols) => (await svc.from(tabla).select(cols).eq('brand_id', brand.id).limit(1).maybeSingle()).data;
const order = await fila('orders', 'id, total_cents');
const ticket = await fila('tickets', 'id, scan_count, invalidated_at');
const proof = await fila('yape_proofs', 'id, status');
const promo = await fila('promo_codes', 'id, is_active');

const intentos = [
  order && ['orders', { total_cents: order.total_cents }, order.id],
  ticket && ['tickets', { scan_count: ticket.scan_count, invalidated_at: ticket.invalidated_at }, ticket.id],
  proof && ['yape_proofs', { status: proof.status }, proof.id],
  promo && ['promo_codes', { is_active: promo.is_active }, promo.id],
].filter(Boolean);
check('demotest tiene filas para probar las 4 tablas', intentos.length === 4, `${intentos.length}/4`);

const roles = [
  ['anon', anon()],
  ['dueño (brand_admin)', await conJwt('brandadmin.demotest@parygo.test')],
  ['puerta (validator)', await conJwt('validator.demotest@parygo.test')],
];

for (const [rol, db] of roles) {
  for (const [tabla, valores, id] of intentos) {
    const r = await db.from(tabla).update(valores).eq('id', id).select('id');
    // Cerrado = error de permiso (42501). 0 filas sin error sería RLS, no grant.
    check(`${rol} NO puede escribir ${tabla}`, !!r.error, r.error ? r.error.code : `filas=${r.data?.length}`);
  }
}

// Leer sigue igual: el panel del dueño y el escáner leen con su sesión.
const dueno = roles[1][1];
const lee = await dueno.from('orders').select('id').eq('brand_id', brand.id).limit(1);
check('el dueño sigue LEYENDO sus órdenes', !lee.error && (lee.data ?? []).length === 1, lee.error?.code ?? `filas=${lee.data?.length}`);
const puerta = roles[2][1];
const leeT = await puerta.from('tickets').select('id').eq('brand_id', brand.id).limit(1);
check('la puerta sigue LEYENDO entradas', !leeT.error && (leeT.data ?? []).length === 1, leeT.error?.code ?? `filas=${leeT.data?.length}`);

log(fallas ? `✘ ${fallas} falla(s)` : '✔ permisos 0077 OK');
process.exit(fallas ? 1 : 0);
