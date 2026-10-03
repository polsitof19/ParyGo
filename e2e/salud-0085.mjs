// 0085: permisos por JWT REAL + vencimiento de Yape sin comprobante. Solo demotest.
//
//   node e2e/salud-0085.mjs
//
// 1. anon NO ejecuta is_super_admin / user_brands / user_is_brand_member /
//    handle_new_user; get_event_active_prices SÍ (la usa la página pública).
// 2. El brand_admin de demotest (sesión real) sigue: is_super_admin() = false,
//    lee su fila de brand_members, sus órdenes y sus eventos internos (las
//    políticas que usan esas funciones siguen andando).
// 3. cleanup_expired_reservations: Yape sin comprobante de hace 3 días →
//    expired; uno de hace 1 hora sigue pendiente.
import { svc, anon, env, log, otpSession } from './lib.mjs';
import { createClient } from '@supabase/supabase-js';

const R = [];
const check = (nombre, ok, detalle = '') => { R.push({ nombre, ok }); log(`${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`); };

const { data: brand } = await svc.from('brands').select('id, slug').eq('slug', 'demotest').single();
if (brand?.slug !== 'demotest') throw new Error('solo demotest');
const { data: ev } = await svc.from('events').select('id').eq('brand_id', brand.id).limit(1).single();

// ---------- 1. anon ----------
const a = anon();
for (const [fn, args] of [
  ['is_super_admin', {}],
  ['user_brands', { p_role: 'brand_admin' }],
  ['user_is_brand_member', { p_brand_id: brand.id, p_role: 'brand_admin' }],
  ['handle_new_user', {}],
]) {
  const r = await a.rpc(fn, args);
  check(`anon NO ejecuta ${fn}`, !!r.error && ['42501', 'PGRST202'].includes(r.error.code ?? ''), r.error?.code ?? 'sin error');
}
const precios = await a.rpc('get_event_active_prices', { p_event_id: ev.id });
check('anon SÍ ejecuta get_event_active_prices (página pública)', !precios.error, precios.error?.code);

// ---------- 2. brand_admin real ----------
const sesion = await otpSession('brandadmin.demotest@parygo.test');
const u = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${sesion.access_token}` } },
});
const sa = await u.rpc('is_super_admin');
check('brand_admin ejecuta is_super_admin (= false)', !sa.error && sa.data === false, sa.error?.code ?? String(sa.data));
const bm = await u.from('brand_members').select('brand_id').eq('brand_id', brand.id);
check('brand_admin lee su membresía', !bm.error && (bm.data ?? []).length >= 1, bm.error?.code ?? `filas=${bm.data?.length}`);
const ords = await u.from('orders').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id);
check('brand_admin lee sus órdenes (RLS con user_is_brand_member)', !ords.error && (ords.count ?? 0) > 0, ords.error?.code ?? `n=${ords.count}`);
const evs = await u.from('events').select('id').eq('brand_id', brand.id).limit(1);
check('brand_admin lee sus eventos', !evs.error && (evs.data ?? []).length === 1, evs.error?.code);
const ajenas = await u.from('brand_members').select('brand_id').neq('brand_id', brand.id);
check('brand_admin NO ve membresías de otras marcas', !ajenas.error && (ajenas.data ?? []).length === 0, `filas=${ajenas.data?.length}`);

// ---------- 3. Yape abandonado ----------
const creadas = [];
const orden = async (horas) => {
  const { data, error } = await svc.from('orders').insert({
    event_id: ev.id, brand_id: brand.id, buyer_name: 'E2E 0085', buyer_email: 'e2e-0085@parygo.test',
    buyer_phone: '999999999', buyer_age_ok: true, payment_method: 'yape_manual', status: 'pending_yape_review',
    subtotal_cents: 1000, total_cents: 1000, created_at: new Date(Date.now() - horas * 3600_000).toISOString(),
  }).select('id').single();
  if (error) throw new Error(error.message);
  creadas.push(data.id);
  return data.id;
};
try {
  const vieja = await orden(72);
  const nueva = await orden(1);
  const c = await svc.rpc('cleanup_expired_reservations');
  check('el cron corre', !c.error, c.error?.message);
  const est = async (id) => (await svc.from('orders').select('status').eq('id', id).single()).data.status;
  check('Yape sin comprobante de hace 72 h → expired', (await est(vieja)) === 'expired', await est(vieja));
  check('Yape sin comprobante de hace 1 h → sigue pendiente', (await est(nueva)) === 'pending_yape_review', await est(nueva));
} finally {
  for (const id of creadas) {
    await svc.from('events_log').delete().eq('order_id', id);
    await svc.from('orders').delete().eq('id', id);
  }
}

const mal = R.filter((r) => !r.ok);
log(`${R.length - mal.length}/${R.length} OK`);
process.exit(mal.length ? 1 : 0);
