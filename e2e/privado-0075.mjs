// Evento privado (0075) contra producción, SOLO en demotest. Decenas de filas,
// nada de volumen. Deja demotest como estaba (tipo 'marca', mismo saldo,
// eventos de prueba archivados).
//  1. Un evento de una marca privada nace con tope 200 (lo pone la base).
//  2. Crear con más de 200 entradas en total o con una ilimitada: rechazado y
//     SIN gastar saldo (todo en una transacción).
//  3. Concurrencia: 2 subas de capacidad simultáneas que juntas pasan el tope
//     → una sola pasa.
//  4. Capa de auth REAL (JWT del dueño de demotest, no service role): no puede
//     quitarse el tope, ni pasarse a 'marca', ni subir la capacidad por encima.
//  5. Una marca normal no se ve afectada (sin tope).
// Uso: node e2e/privado-0075.mjs
import { createClient } from '@supabase/supabase-js';
import { svc, env, otpSession } from './lib.mjs';

const DEMO = '08553a34-988f-4537-b816-43e385b5a7a4';
const DUENO_EMAIL = 'brandadmin.demotest@parygo.test';
let fallas = 0;
const check = (ok, txt) => { console.log(ok ? 'OK   ' : 'FALLA', txt); if (!ok) fallas++; };
const tt = (caps) => caps.map((c, i) => ({ name: `T${i}`, price_cents: 1000, capacity: c === 'ilimitada' ? null : c, is_unlimited: c === 'ilimitada', sort_order: i, phases: [{ price_cents: 1000, starts_at: null, ends_at: null, sort_order: 0 }] }));
const sufijo = Date.now().toString(36);
const creados = [];
const crear = (x, caps) => svc.rpc('create_brand_event', {
  p_brand_id: DEMO, p_actor_user_id: null,
  p_event: { slug: `privado-0075-${sufijo}-${x}`, name: 'Privado 0075', starts_at: '2027-01-10T02:00:00Z' },
  p_ticket_types: tt(caps),
});

const { data: TOPE, error: topeErr } = await svc.rpc('privado_tope_entradas');
if (topeErr || TOPE !== 200) throw new Error('privado_tope_entradas no devuelve 200: ' + (topeErr?.message ?? TOPE));
const { data: antes } = await svc.from('brands').select('event_balance, tipo').eq('id', DEMO).single();
try {
  await svc.from('brands').update({ tipo: 'privado', event_balance: antes.event_balance + 5 }).eq('id', DEMO);

  // 1. Nace con tope.
  const r1 = await crear('a', [100, 50]);
  if (!r1.error) creados.push(r1.data);
  const { data: ev } = await svc.from('events').select('id, tope_entradas').eq('id', r1.data).single();
  check(!r1.error && ev?.tope_entradas === TOPE, `evento de marca privada nace con tope ${ev?.tope_entradas} (${r1.error?.message ?? 'ok'})`);

  // 2. Más del tope / ilimitada: rechazado y sin gastar saldo.
  const { data: s0 } = await svc.from('brands').select('event_balance').eq('id', DEMO).single();
  const r2 = await crear('b', [150, 60]);
  const r3 = await crear('c', [50, 'ilimitada']);
  const { data: s1 } = await svc.from('brands').select('event_balance').eq('id', DEMO).single();
  const { count: sinCrear } = await svc.from('events').select('id', { count: 'exact', head: true }).in('slug', [`privado-0075-${sufijo}-b`, `privado-0075-${sufijo}-c`]);
  check(!!r2.error && r2.error.message.includes('TOPE_ENTRADAS'), `210 entradas en total: rechazado (${r2.error?.message ?? 'SIN ERROR'})`);
  check(!!r3.error && r3.error.message.includes('TOPE_SIN_ILIMITADO'), `con una ilimitada: rechazado (${r3.error?.message ?? 'SIN ERROR'})`);
  check(s1.event_balance === s0.event_balance && sinCrear === 0, `los rechazos no gastan saldo (${s0.event_balance} → ${s1.event_balance}) ni crean eventos (${sinCrear})`);

  // 3. Dos subas simultáneas: 150 + 30 + 30 = 210 > 200 → una sola pasa.
  const { data: tts } = await svc.from('ticket_types').select('id, capacity').eq('event_id', ev.id).order('name');
  const u = await Promise.all(tts.map((t) => svc.from('ticket_types').update({ capacity: t.capacity + 30 }).eq('id', t.id)));
  const uOk = u.filter((x) => !x.error).length;
  const { data: tts2 } = await svc.from('ticket_types').select('capacity').eq('event_id', ev.id);
  const total = tts2.reduce((s, t) => s + t.capacity, 0);
  check(uOk === 1 && total === 180, `2 subas simultáneas → ${uOk} ok, total ${total} (tope ${TOPE})`);

  // 4. Como el ORGANIZADOR, con su JWT.
  const s = await otpSession(DUENO_EMAIL);
  const org = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.access_token}` } },
  });
  const e1 = await org.from('events').update({ tope_entradas: null }).eq('id', ev.id).select('id');
  const { data: ev2 } = await svc.from('events').select('tope_entradas').eq('id', ev.id).single();
  check(ev2.tope_entradas === TOPE, `organizador no se quita el tope (${e1.error?.message ?? `${e1.data?.length ?? 0} filas`})`);
  const e2 = await org.from('brands').update({ tipo: 'marca' }).eq('id', DEMO).select('id');
  const { data: b2 } = await svc.from('brands').select('tipo').eq('id', DEMO).single();
  check(b2.tipo === 'privado', `organizador no se pasa a 'marca' (${e2.error?.message ?? `${e2.data?.length ?? 0} filas`})`);
  const e3 = await org.from('ticket_types').update({ capacity: 500 }).eq('id', tts[0].id).select('id');
  const { data: tts3 } = await svc.from('ticket_types').select('capacity').eq('event_id', ev.id);
  check(tts3.reduce((a, t) => a + t.capacity, 0) <= TOPE, `organizador no pasa el tope (${e3.error?.message ?? `${e3.data?.length ?? 0} filas`})`);
  const e4 = await org.from('brands').select('tipo').eq('id', DEMO).single();
  check(!e4.error && e4.data?.tipo === 'privado', `el organizador SÍ puede leer su tipo (grant de la columna) (${e4.error?.message ?? e4.data?.tipo})`);

  // 5. Una marca normal: sin tope.
  await svc.from('brands').update({ tipo: 'marca' }).eq('id', DEMO);
  const r5 = await crear('d', [1000, 'ilimitada']);
  if (!r5.error) creados.push(r5.data);
  const { data: ev5 } = await svc.from('events').select('tope_entradas').eq('id', r5.data).maybeSingle();
  check(!r5.error && ev5?.tope_entradas === null, `marca normal: 1000 + ilimitada sin tope (${r5.error?.message ?? 'ok'})`);

  // 6. Mover un tipo de entrada de ese evento normal al privado (casi lleno):
  //    el candado corre igual (cambia event_id) → rechazado.
  const { data: t5 } = await svc.from('ticket_types').select('id').eq('event_id', r5.data).eq('is_unlimited', false).limit(1).single();
  const m = await svc.from('ticket_types').update({ event_id: ev.id }).eq('id', t5.id).select('id');
  const { data: donde } = await svc.from('ticket_types').select('event_id').eq('id', t5.id).single();
  check(!!m.error && m.error.message.includes('TOPE_ENTRADAS') && donde.event_id === r5.data, `mover 1000 entradas al evento privado: rechazado (${m.error?.message ?? 'SIN ERROR'})`);
} finally {
  // Limpieza: eventos archivados y demotest como estaba.
  for (const id of creados) await svc.from('events').update({ archived_at: new Date().toISOString(), is_published: false }).eq('id', id);
  await svc.from('brands').update({ tipo: antes.tipo, event_balance: antes.event_balance }).eq('id', DEMO);
  const { data: fin } = await svc.from('brands').select('tipo, event_balance').eq('id', DEMO).single();
  console.log(`demotest queda: tipo=${fin.tipo}, saldo=${fin.event_balance} (antes ${antes.tipo}, ${antes.event_balance})`);
}
console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo OK');
process.exit(fallas ? 1 : 0);
