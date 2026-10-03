// settle_pack_purchase (0070): permisos por JWT REAL y concurrencia, en demotest.
//
//   node e2e/packs-rpc.mjs
//
// Volumen: un puñado de filas. NO es una prueba de carga (CLAUDE.md).
//
// 1. PERMISOS: anon y authenticated (sesión real del brand_admin de demotest)
//    no pueden ejecutar settle_pack_purchase ni leer/insertar pack_purchases.
//    Con service-role el test no probaría nada: por eso van con su propio JWT.
// 2. CONCURRENCIA — mismo pago avisado dos veces a la vez (webhook + vuelta a
//    la página): una acreditación y un 'already_paid'; el saldo sube UNA vez.
// 3. CONCURRENCIA — el mismo pago para dos compras distintas a la vez: una
//    acredita, la otra 'payment_reused'.
// Al final devuelve el saldo de demotest a como estaba (pase lo que pase).
import { svc, anon, env, log, otpSession } from './lib.mjs';
import { createClient } from '@supabase/supabase-js';

const STAMP = Date.now().toString().slice(-6);
const R = [];
const check = (nombre, ok, detalle = '') => { R.push({ nombre, ok }); log(`${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`); };

const { data: brand } = await svc.from('brands').select('id, slug, event_balance').eq('slug', 'demotest').single();
if (brand?.slug !== 'demotest') throw new Error('solo demotest');
const saldo0 = brand.event_balance;
const saldo = async () => (await svc.from('brands').select('event_balance').eq('id', brand.id).single()).data.event_balance;
const compra = async (pack, cents) => {
  const { data, error } = await svc.from('pack_purchases')
    .insert({ brand_id: brand.id, pack, provider: 'mercadopago', currency: 'PEN', amount_cents: cents })
    .select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
};
const settle = (cli, id, pago, cents) => cli.rpc('settle_pack_purchase', {
  p_purchase_id: id, p_provider: 'mercadopago', p_payment_id: pago, p_paid_cents: cents, p_currency: 'PEN',
});

try {
  // ---------- 1. permisos ----------
  const c0 = await compra(1, 15000);
  const a = await settle(anon(), c0, `e2e-anon-${STAMP}`, 15000);
  check('anon NO puede ejecutar settle_pack_purchase', !!a.error && !a.data, `${a.error?.code} ${a.error?.message}`);

  const sesion = await otpSession('brandadmin.demotest@parygo.test');
  const auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${sesion.access_token}` } },
  });
  const u = await settle(auth, c0, `e2e-auth-${STAMP}`, 15000);
  check('authenticated (brand_admin real) NO puede ejecutar settle_pack_purchase', !!u.error && !u.data, `${u.error?.code} ${u.error?.message}`);
  const lee = await auth.from('pack_purchases').select('id').eq('brand_id', brand.id);
  check('authenticated NO puede leer pack_purchases', !!lee.error || (lee.data ?? []).length === 0, lee.error?.code ?? `filas=${lee.data?.length}`);
  const mete = await auth.from('pack_purchases').insert({ brand_id: brand.id, pack: 10, provider: 'mercadopago', currency: 'PEN', amount_cents: 1 });
  check('authenticated NO puede insertar una compra', !!mete.error, mete.error?.code);
  const meteAnon = await anon().from('pack_purchases').insert({ brand_id: brand.id, pack: 10, provider: 'mercadopago', currency: 'PEN', amount_cents: 1 });
  check('anon NO puede insertar una compra', !!meteAnon.error, meteAnon.error?.code);
  check('los intentos sin permiso no tocaron el saldo', (await saldo()) === saldo0, `saldo=${await saldo()}`);

  // ---------- 2. mismo pago, dos avisos a la vez ----------
  const c1 = await compra(3, 39000);
  const antes = await saldo();
  const pago1 = `e2e-conc-${STAMP}`;
  const [r1, r2] = await Promise.all([settle(svc, c1, pago1, 39000), settle(svc, c1, pago1, 39000)]);
  const acciones = [r1.data?.action, r2.data?.action].sort();
  check('mismo pago a la vez: una acreditación y un already_paid', JSON.stringify(acciones) === '["already_paid","credited"]', JSON.stringify(acciones));
  check('el saldo subió UNA vez (+3)', (await saldo()) === antes + 3, `${antes} → ${await saldo()}`);

  // ---------- 3. un pago para dos compras a la vez ----------
  const [c2, c3] = [await compra(1, 15000), await compra(1, 15000)];
  const antes2 = await saldo();
  const pago2 = `e2e-reuso-${STAMP}`;
  const [s1, s2] = await Promise.all([settle(svc, c2, pago2, 15000), settle(svc, c3, pago2, 15000)]);
  const acc2 = [s1.data?.action, s2.data?.action].sort();
  check('un pago para dos compras a la vez: una acredita, la otra payment_reused', JSON.stringify(acc2) === '["credited","payment_reused"]', JSON.stringify(acc2));
  check('el saldo subió solo +1', (await saldo()) === antes2 + 1, `${antes2} → ${await saldo()}`);
} finally {
  await svc.from('brands').update({ event_balance: saldo0 }).eq('id', brand.id);
  log(`saldo de demotest devuelto a ${saldo0}`);
}

const ok = R.filter((r) => r.ok).length;
log(`${ok === R.length ? '✅' : '❌'} ${ok}/${R.length}`);
process.exit(ok === R.length ? 0 : 1);
