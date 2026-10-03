// 0077 + 0078 + 0081 (brands): nadie con JWT escribe directo en orders / tickets /
// yape_proofs / promo_codes (lo vendido) ni en events / ticket_types /
// fases / validator_codes (eso solo desde el panel). Permisos por JWT REAL
// (dueño y puerta de demotest) y anon; con service-role el test no probaría
// nada. Cada intento escribe el MISMO valor que ya tiene la fila: si el
// permiso siguiera abierto, no cambia nada.
//   node e2e/permisos-escritura.mjs
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
const evento = await fila('events', 'id, is_free');
const { data: eventos } = await svc.from('events').select('id').eq('brand_id', brand.id);
// demotest acumula cientos de tipos: con 20 alcanza (un .in() largo no entra en la URL).
const { data: tipos } = await svc.from('ticket_types').select('id, sold').in('event_id', (eventos ?? []).slice(0, 20).map((e) => e.id)).limit(20);
const tipo = tipos?.[0];
const fase = (await svc.from('ticket_type_price_phases').select('id, price_cents').in('ticket_type_id', (tipos ?? []).map((t) => t.id)).limit(1).maybeSingle()).data;

const intentos = [
  order && ['orders', { total_cents: order.total_cents }, order.id],
  ticket && ['tickets', { scan_count: ticket.scan_count, invalidated_at: ticket.invalidated_at }, ticket.id],
  proof && ['yape_proofs', { status: proof.status }, proof.id],
  promo && ['promo_codes', { is_active: promo.is_active }, promo.id],
  evento && ['events', { is_free: evento.is_free }, evento.id],
  tipo && ['ticket_types', { sold: tipo.sold }, tipo.id],
  fase && ['ticket_type_price_phases', { price_cents: fase.price_cents }, fase.id],
  ['brands', { alta_usuario: null }, brand.id],
].filter(Boolean);
check('demotest tiene filas para probar las 8 tablas', intentos.length === 8, `${intentos.length}/8`);

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
  // Códigos de puerta: demotest no tiene; se prueba crear uno elegido a mano
  // (solo generate_validator_code, con CSPRNG, puede). Si entra, se borra.
  const code = `E2E${Date.now().toString(36).toUpperCase()}`.slice(0, 8);
  const r = await db.from('validator_codes').insert({ brand_id: brand.id, code, expires_at: new Date(Date.now() + 36e5).toISOString() }).select('id');
  if (r.data?.length) await svc.from('validator_codes').delete().eq('id', r.data[0].id);
  // Tiene que ser FALTA DE PERMISO (42501): un 23502 (falta user_id) diría que
  // el permiso sigue abierto y solo falló por el dato.
  check(`${rol} NO puede crear validator_codes`, r.error?.code === '42501', r.error ? r.error.code : `filas=${r.data?.length}`);
}

// Leer sigue igual: el panel del dueño y el escáner leen con su sesión.
const dueno = roles[1][1];
const lee = await dueno.from('orders').select('id').eq('brand_id', brand.id).limit(1);
check('el dueño sigue LEYENDO sus órdenes', !lee.error && (lee.data ?? []).length === 1, lee.error?.code ?? `filas=${lee.data?.length}`);
const puerta = roles[2][1];
const leeT = await puerta.from('tickets').select('id').eq('brand_id', brand.id).limit(1);
check('la puerta sigue LEYENDO entradas', !leeT.error && (leeT.data ?? []).length === 1, leeT.error?.code ?? `filas=${leeT.data?.length}`);

log(fallas ? `✘ ${fallas} falla(s)` : '✔ permisos de escritura OK');
process.exit(fallas ? 1 : 0);
