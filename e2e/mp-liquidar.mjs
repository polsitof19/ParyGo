// 0083 + 0084: Mercado Pago por marca — pago aprobado tras un rechazo y reembolso que
// anula entradas. Contra la base REAL, solo en demotest, un puñado de filas.
//
//   node e2e/mp-liquidar.mjs
//
// 1. PERMISOS por JWT real: anon y el brand_admin de demotest NO ejecutan
//    settle_mp_payment ni refund_mp_order.
// 2. Orden 'failed' (el webhook viejo la marcaba así al primer rechazo) +
//    pago aprobado → se emiten las entradas (antes: not_settleable).
// 3. Monto distinto → no emite nada.
// 4. CONCURRENCIA: el mismo pago avisado dos veces a la vez → un 'issued' y un
//    'already_issued', exactamente qty entradas.
// 5. Reembolso: orden refunded, entradas anuladas, `sold` vuelve; repetirlo no
//    hace nada. Una orden no cobrada no se "devuelve".
// 6. (0084) Devolver OTRO pago de la orden (duplicado) no anula nada; un
//    segundo pago aprobado queda en la bitácora; un "approved" atrasado no
//    resucita una orden devuelta; reembolso y aviso aprobado A LA VEZ terminan
//    en un estado coherente (nunca paid con entradas anuladas).
// Al final borra todo lo creado y verifica que `sold` quedó como estaba.
import { svc, anon, env, log, otpSession } from './lib.mjs';
import { createClient } from '@supabase/supabase-js';

const STAMP = Date.now().toString().slice(-6);
const R = [];
const check = (nombre, ok, detalle = '') => { R.push({ nombre, ok }); log(`${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`); };

const { data: brand } = await svc.from('brands').select('id, slug').eq('slug', 'demotest').single();
if (brand?.slug !== 'demotest') throw new Error('solo demotest');

// Un tipo de entrada de demotest con lugar para 2 (o ilimitado).
const { data: tipos } = await svc.from('ticket_types')
  .select('id, name, event_id, capacity, sold, is_unlimited, events!inner(brand_id)')
  .eq('events.brand_id', brand.id).eq('is_active', true);
const tt = (tipos ?? []).find((t) => t.is_unlimited || (t.capacity ?? 0) - (t.sold ?? 0) >= 4);
if (!tt) throw new Error('demotest no tiene un tipo de entrada con lugar');
const sold = async () => (await svc.from('ticket_types').select('sold').eq('id', tt.id).single()).data.sold;
const sold0 = await sold();

const QTY = 2, UNIT = 1234, TOTAL = QTY * UNIT;
const creadas = [];
const orden = async (status) => {
  const { data, error } = await svc.from('orders').insert({
    event_id: tt.event_id, brand_id: brand.id, buyer_name: 'E2E MP', buyer_email: `e2e-mp-${STAMP}@parygo.test`,
    buyer_phone: '999999999', buyer_age_ok: true, payment_method: 'mercadopago', status,
    subtotal_cents: TOTAL, total_cents: TOTAL, mp_preference_id: `e2e-pref-${STAMP}`,
  }).select('id').single();
  if (error) throw new Error(error.message);
  creadas.push(data.id);
  const it = await svc.from('order_items').insert({
    order_id: data.id, ticket_type_id: tt.id, ticket_type_name: tt.name, quantity: QTY, unit_price_cents: UNIT, subtotal_cents: TOTAL,
  });
  if (it.error) throw new Error(it.error.message);
  return data.id;
};
const settle = (cli, id, pago, cents = TOTAL) => cli.rpc('settle_mp_payment', {
  p_order_id: id, p_brand_id: brand.id, p_payment_id: pago, p_status: 'approved', p_paid_amount_cents: cents,
});
const refund = (cli, id, pago) => cli.rpc('refund_mp_order', { p_order_id: id, p_brand_id: brand.id, p_payment_id: pago, p_status: 'refunded' });
const entradas = async (id) => (await svc.from('tickets').select('id, invalidated_at').eq('order_id', id)).data ?? [];
const estado = async (id) => (await svc.from('orders').select('status').eq('id', id).single()).data.status;

try {
  // ---------- 1. permisos ----------
  const o0 = await orden('failed');
  const sesion = await otpSession('brandadmin.demotest@parygo.test');
  const auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${sesion.access_token}` } },
  });
  for (const [quien, cli] of [['anon', anon()], ['brand_admin', auth]]) {
    const s = await settle(cli, o0, `e2e-${quien}-${STAMP}`);
    check(`${quien} NO puede ejecutar settle_mp_payment`, !!s.error && !s.data, s.error?.code);
    const r = await refund(cli, o0, 'x');
    check(`${quien} NO puede ejecutar refund_mp_order`, !!r.error && !r.data, r.error?.code);
  }
  check('los intentos sin permiso no emitieron nada', (await entradas(o0)).length === 0 && (await estado(o0)) === 'failed');

  // ---------- 2. failed + aprobado → emite ----------
  const a = await settle(svc, o0, `e2e-ok-${STAMP}`);
  check('orden failed + pago aprobado → issued', a.data?.action === 'issued' && a.data?.ticket_count === QTY, JSON.stringify(a.data ?? a.error));
  check('la orden quedó paid', (await estado(o0)) === 'paid');
  check(`sold subió ${QTY}`, (await sold()) === sold0 + QTY, `sold=${await sold()}`);

  // ---------- 3. monto distinto ----------
  const o1 = await orden('failed');
  const m = await settle(svc, o1, `e2e-mal-${STAMP}`, TOTAL - 1);
  check('monto distinto → amount_mismatch sin entradas', m.data?.action === 'amount_mismatch' && (await entradas(o1)).length === 0, JSON.stringify(m.data ?? m.error));

  // ---------- 4. concurrencia ----------
  const o2 = await orden('pending_payment');
  const pago = `e2e-conc-${STAMP}`;
  const [x, y] = await Promise.all([settle(svc, o2, pago), settle(svc, o2, pago)]);
  const acciones = [x.data?.action, y.data?.action].sort().join(',');
  check('dos avisos a la vez → issued + already_issued', acciones === 'already_issued,issued', acciones);
  check(`exactamente ${QTY} entradas`, (await entradas(o2)).length === QTY);

  // ---------- 5. reembolso ----------
  const antes = await sold();
  const otro = await refund(svc, o2, `e2e-dup-${STAMP}`);
  check('devolver OTRO pago de la orden no anula nada', otro.data?.action === 'payment_mismatch' && (await entradas(o2)).every((t) => !t.invalidated_at) && (await estado(o2)) === 'paid', JSON.stringify(otro.data ?? otro.error));
  const dup = await settle(svc, o2, `e2e-dup-${STAMP}`);
  const { count: nDup } = await svc.from('events_log').select('id', { count: 'exact', head: true }).eq('order_id', o2).eq('type', 'mp_duplicate_payment');
  check('un segundo pago aprobado queda anotado (mp_duplicate_payment)', dup.data?.action === 'already_issued' && nDup === 1, `${dup.data?.action} n=${nDup}`);
  const r1 = await refund(svc, o2, pago);
  check('reembolso → refunded y entradas anuladas', r1.data?.action === 'refunded' && r1.data?.tickets_anuladas === QTY, JSON.stringify(r1.data ?? r1.error));
  check('la orden quedó refunded', (await estado(o2)) === 'refunded');
  check('todas sus entradas tienen invalidated_at', (await entradas(o2)).every((t) => t.invalidated_at));
  check(`sold bajó ${QTY}`, (await sold()) === antes - QTY, `sold=${await sold()}`);
  const r2 = await refund(svc, o2, pago);
  check('repetir el reembolso no hace nada', r2.data?.tickets_anuladas === 0, JSON.stringify(r2.data));
  const tarde = await settle(svc, o2, pago);
  check('un approved atrasado no resucita la orden devuelta', tarde.data?.action === 'refunded' && (await estado(o2)) === 'refunded', JSON.stringify(tarde.data ?? tarde.error));

  // Reembolso y aviso aprobado del mismo pago a la vez sobre una orden ya pagada.
  const o3 = await orden('pending_payment');
  const p3 = `e2e-rc-${STAMP}`;
  await settle(svc, o3, p3);
  await Promise.all([refund(svc, o3, p3), settle(svc, o3, p3)]);
  const est3 = await estado(o3), tk3 = await entradas(o3);
  const coherente = (est3 === 'refunded' && tk3.every((t) => t.invalidated_at)) || (est3 === 'paid' && tk3.every((t) => !t.invalidated_at));
  check('reembolso + aprobado a la vez → estado coherente', coherente, `${est3} anuladas=${tk3.filter((t) => t.invalidated_at).length}/${tk3.length}`);

  const r3 = await refund(svc, o1, 'x');
  check('una orden no cobrada no se devuelve', r3.data?.action === 'not_paid' && (await estado(o1)) === 'failed', JSON.stringify(r3.data));
} finally {
  // Limpieza: entradas (el trigger descuenta las activas de sold), ítems, bitácora y órdenes.
  for (const id of creadas) {
    await svc.from('tickets').delete().eq('order_id', id);
    await svc.from('promo_redemptions').delete().eq('order_id', id);
    await svc.from('events_log').delete().eq('order_id', id);
    await svc.from('stock_reservations').delete().eq('order_id', id);
    await svc.from('order_items').delete().eq('order_id', id);
    const d = await svc.from('orders').delete().eq('id', id);
    if (d.error) log('⚠️ no se borró la orden', id, d.error.message);
  }
  check('sold quedó como estaba', (await sold()) === sold0, `sold=${await sold()} (antes ${sold0})`);
}

const mal = R.filter((r) => !r.ok);
log(`${R.length - mal.length}/${R.length} OK`);
process.exit(mal.length ? 1 : 0);
