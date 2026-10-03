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

  // ---------- carrera: evento nuevo + cambio de moneda a la vez ----------
  await svc.from('events').delete().eq('id', e1.data.id);
  let malas = 0;
  for (let i = 0; i < 4; i++) {
    const de = i % 2 ? 'COP' : 'USD', a = i % 2 ? 'USD' : 'COP';
    await svc.from('events').delete().eq('brand_id', tmp.id);
    await svc.from('brands').update({ moneda: de, metodo_manual: 'transferencia' }).eq('id', tmp.id);
    const [ev, cambio] = await Promise.all([
      svc.from('events').insert(evento(`c${i}`)).select('id, created_at').single(),
      svc.from('brands').update({ moneda: a }).eq('id', tmp.id),
    ]);
    // Inválido: el evento existe Y la moneda cambió DESPUÉS de crearlo. Si el
    // cambio ganó, el evento nace con la moneda nueva (válido).
    if (!ev.error && !cambio.error) {
      // Los dos pasaron: válido solo si el cambio se aplicó antes del evento.
      // Con FOR SHARE el UPDATE posterior ve el evento y falla, así que si los
      // dos pasaron el cambio fue primero; se verifica que no quede un cambio
      // posible ahora.
      const otra = await svc.from('brands').update({ moneda: de }).eq('id', tmp.id);
      if (!otra.error) malas++;
    }
    if (ev.error && cambio.error) malas++;
  }
  check('carrera evento + cambio de moneda: nunca un evento con la moneda cambiada después', malas === 0, `${malas} malas en 4`);
} finally {
  await svc.from('events').delete().eq('brand_id', tmp.id);
  await svc.from('brands').delete().eq('id', tmp.id);
  const { data: fin } = await svc.from('brands').select('moneda, metodo_manual').eq('id', demo.id).single();
  check('demotest sigue en PEN + yape', fin?.moneda === 'PEN' && fin?.metodo_manual === 'yape');
}

const fallas = R.filter((x) => !x).length;
log(`${R.length - fallas}/${R.length} OK`);
process.exit(fallas ? 1 : 0);
