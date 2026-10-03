// 0088: moneda, zona y medio manual por marca. JWT REAL + reglas + carrera.
// Marca temporal is_test (se borra al final); demotest solo se LEE.
//
//   node e2e/pais-0088.mjs
import { svc, anon, env, log, otpSession } from './lib.mjs';
import { createClient } from '@supabase/supabase-js';

const STAMP = Date.now().toString().slice(-6);
const R = [];
const check = (nombre, ok, detalle = '') => { R.push(ok); log(`${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`); };

const { data: demo } = await svc.from('brands').select('id').eq('slug', 'demotest').single();
const { data: tmp, error: eTmp } = await svc.from('brands')
  .insert({ slug: `e2e-pais-${STAMP}`, name: 'E2E País', is_test: true, archived_at: new Date().toISOString() })
  .select('id, moneda, zona_horaria, metodo_manual').single();
if (eTmp) throw new Error(eTmp.message);
const evento = (n) => ({
  brand_id: tmp.id, slug: `e2e-pais-${STAMP}-${n}`, name: `E2E País ${n}`,
  starts_at: new Date(Date.now() + 15 * 864e5).toISOString(),
  ends_at: new Date(Date.now() + 15 * 864e5 + 8 * 36e5).toISOString(),
  venue_name: 'Local E2E', is_published: false, is_free: true, min_age: 0,
});

try {
  check('defaults PEN / Lima / yape', tmp.moneda === 'PEN' && tmp.zona_horaria === 'America/Lima' && tmp.metodo_manual === 'yape');

  // ---------- permisos (JWT real) ----------
  const sesion = await otpSession('brandadmin.demotest@parygo.test');
  const u = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${sesion.access_token}` } },
  });
  for (const [quien, cli] of [['anon', anon()], ['brand_admin', u]]) {
    const l = await cli.from('brands').select('moneda, zona_horaria, metodo_manual').eq('id', demo.id).single();
    check(`${quien} lee moneda/zona/medio`, !l.error && l.data?.moneda === 'PEN', l.error?.code);
    const w = await cli.from('brands').update({ moneda: 'USD', metodo_manual: 'zelle' }).eq('id', demo.id).select('id');
    check(`${quien} NO escribe brands`, !!w.error || (w.data ?? []).length === 0, w.error?.code ?? 'sin filas');
  }

  // ---------- reglas ----------
  const mal = await svc.from('brands').update({ moneda: 'COP' }).eq('id', tmp.id);
  check('CHECK: yape con COP → rechazado', mal.error?.code === '23514', mal.error?.code);
  const bien = await svc.from('brands').update({ moneda: 'COP', metodo_manual: 'nequi', zona_horaria: 'America/Bogota' }).eq('id', tmp.id);
  check('sin eventos: pasa a COP + Nequi', !bien.error, bien.error?.message);
  const tr = await svc.from('brands').update({ metodo_manual: 'transferencia' }).eq('id', tmp.id);
  check('transferencia sirve con COP', !tr.error, tr.error?.message);
  const zelleCop = await svc.from('brands').update({ metodo_manual: 'zelle' }).eq('id', tmp.id);
  check('CHECK: zelle con COP → rechazado', zelleCop.error?.code === '23514', zelleCop.error?.code);
  const zona = await svc.from('brands').update({ zona_horaria: 'Europe/Paris' }).eq('id', tmp.id);
  check('CHECK: zona fuera de la lista → rechazada', zona.error?.code === '23514', zona.error?.code);

  const e1 = await svc.from('events').insert(evento(1)).select('id').single();
  if (e1.error) throw new Error('evento: ' + e1.error.message);
  const bloq = await svc.from('brands').update({ moneda: 'USD', metodo_manual: 'transferencia' }).eq('id', tmp.id);
  check('con un evento: la moneda NO cambia', /MONEDA_CON_EVENTOS/.test(bloq.error?.message ?? ''), bloq.error?.message);
  const z2 = await svc.from('brands').update({ zona_horaria: 'America/Lima' }).eq('id', tmp.id);
  check('con un evento: la zona sí cambia', !z2.error, z2.error?.message);
  const dmo = await svc.from('brands').update({ moneda: 'USD', metodo_manual: 'zelle' }).eq('id', demo.id);
  check('demotest (con eventos) tampoco cambia', !!dmo.error, dmo.error?.message);

  // ---------- 0089: la RPC compara la moneda con la que se leyeron los precios ----------
  await svc.from('events').delete().eq('id', e1.data.id);
  await svc.from('brands').update({ moneda: 'COP', metodo_manual: 'transferencia', event_balance: 2 }).eq('id', tmp.id);
  const rpc = (n, moneda) => svc.rpc('create_brand_event', {
    p_brand_id: tmp.id, p_actor_user_id: sesion.user.id, p_ticket_types: [],
    p_event: { ...evento(n), ...(moneda ? { moneda } : {}) },
  });
  const r1 = await rpc('m1', 'USD');
  const { data: b1 } = await svc.from('brands').select('event_balance').eq('id', tmp.id).single();
  check('RPC con moneda distinta → MONEDA_CAMBIO y el saldo no se gasta', /MONEDA_CAMBIO/.test(r1.error?.message ?? '') && b1.event_balance === 2, r1.error?.message);
  const r2 = await rpc('m2', 'COP');
  check('RPC con la misma moneda → crea', !r2.error && !!r2.data, r2.error?.message);
  await svc.from('events').delete().eq('brand_id', tmp.id);
  const r3 = await rpc('m3', null);
  check('RPC sin moneda (deploy viejo) → crea igual', !r3.error && !!r3.data, r3.error?.message);

  // ---------- carrera: evento nuevo + cambio de moneda a la vez ----------
  // Invariante: si el evento existe, su marca tiene la moneda que había cuando
  // se creó. Con FOR SHARE, o el cambio va primero (y el evento nace con la
  // moneda nueva) o el evento va primero (y el cambio choca con él). Se mide
  // con la moneda final y la creación de cada uno.
  let malas = 0;
  for (let i = 0; i < 6; i++) {
    const de = i % 2 ? 'COP' : 'USD', a = i % 2 ? 'USD' : 'COP';
    await svc.from('events').delete().eq('brand_id', tmp.id);
    await svc.from('brands').update({ moneda: de, metodo_manual: 'transferencia' }).eq('id', tmp.id);
    const [ev, cambio] = await Promise.all([
      svc.from('events').insert(evento(`c${i}`)).select('id').single(),
      svc.from('brands').update({ moneda: a }).eq('id', tmp.id),
    ]);
    const { data: fin } = await svc.from('brands').select('moneda').eq('id', tmp.id).single();
    // Los dos no pueden pasar si el evento fue primero; si los dos pasaron, el
    // cambio fue primero y la moneda final es la nueva. Si solo el evento pasó,
    // la moneda sigue siendo la vieja. Nunca: los dos fallan.
    const ok = (!ev.error && !cambio.error && fin.moneda === a)
      || (!ev.error && cambio.error && /MONEDA_CON_EVENTOS/.test(cambio.error.message) && fin.moneda === de);
    if (!ok) malas++;
  }
  check('carrera evento + cambio de moneda: siempre uno de los dos órdenes válidos', malas === 0, `${malas} malas en 6`);
} finally {
  await svc.from('events').delete().eq('brand_id', tmp.id);
  await svc.from('brands').delete().eq('id', tmp.id);
  const { data: fin } = await svc.from('brands').select('moneda, metodo_manual').eq('id', demo.id).single();
  check('demotest sigue en PEN + yape', fin?.moneda === 'PEN' && fin?.metodo_manual === 'yape');
}

const fallas = R.filter((x) => !x).length;
log(`${R.length - fallas}/${R.length} OK`);
process.exit(fallas ? 1 : 0);
