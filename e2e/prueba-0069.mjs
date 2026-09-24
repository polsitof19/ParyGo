// Prueba gratis (0069) contra producción, SOLO en demotest. Decenas de filas,
// nada de volumen. Deja demotest como estaba (sin prueba, eventos archivados).
//  1. Concurrencia: 2 create_brand_trial_event simultáneos → 1 evento, 1 NO_TRIAL.
//  2. Concurrencia: 2 subas de capacidad simultáneas que juntas pasan 50 → 1 ok.
//  3. Capa de auth REAL (JWT del dueño de demotest, no service role):
//     no puede quitar es_prueba, ni pasar el tope, ni llamar al RPC.
// Uso: node e2e/prueba-0069.mjs
import { createClient } from '@supabase/supabase-js';
import { svc, env, otpSession } from './lib.mjs';

const DEMO = '08553a34-988f-4537-b816-43e385b5a7a4';
const DUENO_EMAIL = 'brandadmin.demotest@parygo.test';
let fallas = 0;
const check = (ok, txt) => { console.log(ok ? 'OK   ' : 'FALLA', txt); if (!ok) fallas++; };
const tt = (caps) => caps.map((c, i) => ({ name: `T${i}`, price_cents: 1000, capacity: c, is_unlimited: false, sort_order: i, phases: [{ price_cents: 1000, starts_at: null, ends_at: null, sort_order: 0 }] }));
const sufijo = Date.now().toString(36);
const creados = [];

const { data: antes } = await svc.from('brands').select('event_balance, prueba_disponible').eq('id', DEMO).single();
try {
  await svc.from('brands').update({ prueba_disponible: true }).eq('id', DEMO);

  // 1. Dos pestañas a la vez.
  const r = await Promise.all(['a', 'b'].map((x) => svc.rpc('create_brand_trial_event', {
    p_brand_id: DEMO, p_actor_user_id: null,
    p_event: { slug: `prueba-0069-${sufijo}-${x}`, name: 'Prueba 0069', starts_at: '2027-01-10T02:00:00Z' },
    p_ticket_types: tt([25, 20]),
  })));
  const oks = r.filter((x) => !x.error);
  oks.forEach((x) => creados.push(x.data));
  check(oks.length === 1 && r.some((x) => x.error?.message.includes('NO_TRIAL')), `2 simultáneos → ${oks.length} evento(s): ${r.map((x) => x.error?.message ?? 'ok').join(' / ')}`);
  const ev = oks[0]?.data;
  const { data: b1 } = await svc.from('brands').select('event_balance, prueba_disponible').eq('id', DEMO).single();
  check(b1.event_balance === antes.event_balance && !b1.prueba_disponible, `saldo intacto (${b1.event_balance}) y prueba gastada`);

  // 2. Dos subas simultáneas: 25+20=45; +4 y +4 = 53 > 50 → una sola pasa.
  const { data: tts } = await svc.from('ticket_types').select('id, name, capacity').eq('event_id', ev).order('name');
  const u = await Promise.all(tts.map((t) => svc.from('ticket_types').update({ capacity: t.capacity + 4 }).eq('id', t.id)));
  const uOk = u.filter((x) => !x.error).length;
  const { data: tts2 } = await svc.from('ticket_types').select('capacity').eq('event_id', ev);
  const total = tts2.reduce((s, t) => s + t.capacity, 0);
  check(uOk === 1 && total === 49, `2 subas simultáneas → ${uOk} ok, total ${total} (≤ 50)`);

  // 3. Como el ORGANIZADOR, con su JWT.
  const s = await otpSession(DUENO_EMAIL);
  const org = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.access_token}` } },
  });
  const e1 = await org.from('events').update({ es_prueba: false }).eq('id', ev).select('id');
  const { data: ev2 } = await svc.from('events').select('es_prueba').eq('id', ev).single();
  check(!!e1.error && ev2.es_prueba, `organizador no quita es_prueba (${e1.error?.message ?? 'SIN ERROR'})`);
  const e2 = await org.from('ticket_types').update({ capacity: 500 }).eq('id', tts[0].id).select('id');
  check(!!e2.error && e2.error.message.includes('PRUEBA_TOPE'), `organizador no pasa el tope (${e2.error?.message ?? 'SIN ERROR'})`);
  const e3 = await org.rpc('create_brand_trial_event', { p_brand_id: DEMO, p_actor_user_id: null, p_event: {}, p_ticket_types: [] });
  check(!!e3.error && /permission denied/i.test(e3.error.message), `organizador no llama al RPC (${e3.error?.message ?? 'SIN ERROR'})`);
  const e4 = await org.from('brands').update({ prueba_disponible: true }).eq('id', DEMO).select('id');
  const { data: b2 } = await svc.from('brands').select('prueba_disponible').eq('id', DEMO).single();
  check(!b2.prueba_disponible, `organizador no se da la prueba (${e4.error?.message ?? `${e4.data?.length ?? 0} filas`})`);
} finally {
  // Limpieza: los eventos creados quedan archivados y demotest como estaba.
  for (const id of creados) await svc.from('events').update({ archived_at: new Date().toISOString(), is_published: false }).eq('id', id);
  await svc.from('brands').update({ prueba_disponible: antes.prueba_disponible, event_balance: antes.event_balance }).eq('id', DEMO);
}
console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo OK');
process.exit(fallas ? 1 : 0);
