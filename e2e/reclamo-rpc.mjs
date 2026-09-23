// claim_free_order (0064): permisos por JWT REAL y concurrencia, en demotest.
//
//   node e2e/reclamo-rpc.mjs
//
// Volumen: un evento, un puñado de reclamos. NO es una prueba de carga (ver
// "PROHIBIDO: pruebas de carga contra producción" en CLAUDE.md).
//
// 1. PERMISOS: anon y authenticated (sesión real del brand_admin de demotest)
//    no pueden ejecutar la función. service-role sí. Con service-role el test
//    no probaría nada: por eso los dos primeros van con su propio JWT.
// 2. CONCURRENCIA — último lugar: aforo 1, dos personas a la vez → un éxito,
//    un "insufficient_stock", sold = 1, y ninguna orden huérfana del rechazo.
// 3. CONCURRENCIA — misma persona: límite 1 por persona, el mismo email dos
//    veces a la vez → un éxito, un "per_person_limit".
// 4. IDEMPOTENCIA — el MISMO reclamo (mismo claim_id) dos veces a la vez, como
//    un reintento que sale antes de que llegue la respuesta del primero → los
//    dos devuelven la MISMA orden, una sola orden y una sola entrada.
// demotest vive archivada y una marca archivada no reclama: se desarchiva
// durante el test y se vuelve a archivar al final (pase lo que pase).
// Al final archiva el evento (cleanup.mjs además limpia los e2e-*).
import { svc, anon, env, log, otpSession } from './lib.mjs';
import { createClient } from '@supabase/supabase-js';

const STAMP = Date.now().toString().slice(-6);
const R = [];
const check = (nombre, ok, detalle = '') => { R.push({ nombre, ok }); log(`${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`); };

const { data: brand } = await svc.from('brands').select('id, archived_at').eq('slug', 'demotest').single();
const estabaArchivada = !!brand.archived_at;
if (estabaArchivada) await svc.from('brands').update({ archived_at: null }).eq('id', brand.id);

async function eventoGratis(sufijo, { capacidad, porPersona = null }) {
  const inicio = new Date(Date.now() + 9 * 86400000);
  const { data: ev, error } = await svc.from('events').insert({
    brand_id: brand.id, slug: `e2e-rpc-${sufijo}-${STAMP}`, name: `E2E RPC ${sufijo} ${STAMP}`,
    starts_at: inicio.toISOString(), ends_at: new Date(inicio.getTime() + 6 * 3600000).toISOString(),
    is_published: true, is_free: true, min_age: 0, max_per_person: porPersona,
  }).select('id').single();
  if (error) throw new Error(error.message);
  const { data: tt, error: e2 } = await svc.from('ticket_types').insert({
    event_id: ev.id, name: 'Entrada', price_cents: 0, capacity: capacidad,
    is_active: true, is_unlimited: false, is_courtesy: false, max_scans: 1, sort_order: 1,
  }).select('id').single();
  if (e2) throw new Error(e2.message);
  return { ev: ev.id, tt: tt.id };
}

const args = (ev, tt, email, dni, sesion, claimId = null) => ({
  p_event_id: ev, p_brand_id: brand.id,
  p_items: [{ ticket_type_id: tt, quantity: 1 }],
  p_buyer_name: 'E2E RPC', p_buyer_email: email, p_buyer_phone: '+51999111222',
  p_doc_type: 'dni', p_dni: dni, p_age_ok: true, p_marketing: false,
  p_session_id: sesion, p_ip: null, p_user_agent: 'e2e', p_utm: {}, p_claim_id: claimId,
});

const eventos = [];
try {
  // ---------- 1. permisos ----------
  const p = await eventoGratis('permisos', { capacidad: 5 });
  eventos.push(p.ev);
  const a = await anon().rpc('claim_free_order', args(p.ev, p.tt, `e2e-rpc-anon-${STAMP}@test.local`, '10000001', `sesion-anon-${STAMP}`));
  check('anon NO puede ejecutar claim_free_order', !!a.error && !a.data, a.error?.code + ' ' + a.error?.message);

  const sesion = await otpSession('brandadmin.demotest@parygo.test');
  const auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${sesion.access_token}` } },
  });
  const u = await auth.rpc('claim_free_order', args(p.ev, p.tt, `e2e-rpc-auth-${STAMP}@test.local`, '10000002', `sesion-auth-${STAMP}`));
  check('authenticated (brand_admin real) NO puede ejecutar claim_free_order', !!u.error && !u.data, u.error?.code + ' ' + u.error?.message);

  const { count: sinOrdenes } = await svc.from('orders').select('id', { count: 'exact', head: true }).eq('event_id', p.ev);
  check('los intentos sin permiso no dejaron órdenes', sinOrdenes === 0, `órdenes=${sinOrdenes}`);

  const s = await svc.rpc('claim_free_order', args(p.ev, p.tt, `e2e-rpc-svc-${STAMP}@test.local`, '10000003', `sesion-svc-${STAMP}`));
  check('service-role SÍ puede (control)', s.data?.ok === true, JSON.stringify(s.data ?? s.error));

  // ---------- 2. último lugar, dos personas a la vez ----------
  const c = await eventoGratis('ultimo', { capacidad: 1 });
  eventos.push(c.ev);
  const [r1, r2] = await Promise.all([
    svc.rpc('claim_free_order', args(c.ev, c.tt, `e2e-rpc-c1-${STAMP}@test.local`, '20000001', `sesion-c1-${STAMP}`)),
    svc.rpc('claim_free_order', args(c.ev, c.tt, `e2e-rpc-c2-${STAMP}@test.local`, '20000002', `sesion-c2-${STAMP}`)),
  ]);
  const exitos = [r1, r2].filter((r) => r.data?.ok === true).length;
  const agotados = [r1, r2].filter((r) => /insufficient_stock/.test(r.error?.message ?? '')).length;
  check('último lugar: un éxito y un "agotado"', exitos === 1 && agotados === 1, JSON.stringify([r1.data ?? r1.error?.message, r2.data ?? r2.error?.message]));
  const { data: ttC } = await svc.from('ticket_types').select('sold').eq('id', c.tt).single();
  const { count: ordC } = await svc.from('orders').select('id', { count: 'exact', head: true }).eq('event_id', c.ev);
  const { count: tkC } = await svc.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', c.ev);
  check('último lugar: sold=1, 1 orden, 1 entrada (el rechazo no deja orden)', ttC.sold === 1 && ordC === 1 && tkC === 1, `sold=${ttC.sold} órdenes=${ordC} tickets=${tkC}`);

  // ---------- 3. misma persona, dos veces a la vez ----------
  const m = await eventoGratis('persona', { capacidad: 10, porPersona: 1 });
  eventos.push(m.ev);
  const email = `e2e-rpc-misma-${STAMP}@test.local`;
  const [m1, m2] = await Promise.all([
    svc.rpc('claim_free_order', args(m.ev, m.tt, email, '30000001', `sesion-m1-${STAMP}`)),
    svc.rpc('claim_free_order', args(m.ev, m.tt, email, '30000002', `sesion-m2-${STAMP}`)),
  ]);
  const ok = [m1, m2].filter((r) => r.data?.ok === true).length;
  const limite = [m1, m2].filter((r) => /per_person_limit/.test(r.error?.message ?? '')).length;
  check('misma persona a la vez: un éxito y un "límite por persona"', ok === 1 && limite === 1, JSON.stringify([m1.data ?? m1.error?.message, m2.data ?? m2.error?.message]));
  const { count: tkM } = await svc.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', m.ev);
  check('misma persona: una sola entrada emitida', tkM === 1, `tickets=${tkM}`);

  // ---------- 4. mismo claim_id, dos veces a la vez ----------
  const i = await eventoGratis('claim', { capacidad: 10, porPersona: 2 });
  eventos.push(i.ev);
  const cid = crypto.randomUUID();
  const emailI = `e2e-rpc-claim-${STAMP}@test.local`;
  const [i1, i2] = await Promise.all([
    svc.rpc('claim_free_order', args(i.ev, i.tt, emailI, '40000001', `sesion-i-${STAMP}`, cid)),
    svc.rpc('claim_free_order', args(i.ev, i.tt, emailI, '40000001', `sesion-i-${STAMP}`, cid)),
  ]);
  const mismas = i1.data?.ok === true && i2.data?.ok === true && i1.data.order_id === i2.data.order_id;
  const replays = [i1, i2].filter((r) => r.data?.replayed === true).length;
  check('mismo claim_id a la vez: los dos OK con la MISMA orden (uno es replay)', mismas && replays === 1,
    JSON.stringify([i1.data ?? i1.error?.message, i2.data ?? i2.error?.message]));
  const { count: ordI } = await svc.from('orders').select('id', { count: 'exact', head: true }).eq('event_id', i.ev);
  const { count: tkI } = await svc.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', i.ev);
  const { data: ttI } = await svc.from('ticket_types').select('sold').eq('id', i.tt).single();
  check('mismo claim_id: 1 orden, 1 entrada, sold=1 (el límite de 2 no se gastó dos veces)', ordI === 1 && tkI === 1 && ttI.sold === 1,
    `órdenes=${ordI} tickets=${tkI} sold=${ttI.sold}`);
  const i3 = await svc.rpc('claim_free_order', args(i.ev, i.tt, emailI, '40000001', `sesion-i-${STAMP}`, cid));
  check('reintento posterior con el mismo claim_id: misma orden', i3.data?.order_id === i1.data?.order_id && i3.data?.replayed === true, JSON.stringify(i3.data ?? i3.error));
} finally {
  if (eventos.length) {
    await svc.from('events').update({ archived_at: new Date().toISOString(), is_published: false }).in('id', eventos);
  }
  if (estabaArchivada) await svc.from('brands').update({ archived_at: new Date().toISOString() }).eq('id', brand.id);
}
const fallas = R.filter((r) => !r.ok).length;
log(fallas ? `❌ ${fallas} de ${R.length} fallaron` : `✅ ${R.length}/${R.length}`);
process.exit(fallas ? 1 : 0);
