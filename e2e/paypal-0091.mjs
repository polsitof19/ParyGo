// 0091: PayPal para las entradas — RPCs de credenciales, cobro y devolución.
// JWT REAL + concurrencia. Marcas temporales is_test en USD (se borran al
// final); demotest solo presta su brand_admin para el JWT.
//
//   node e2e/paypal-0091.mjs
import { svc, anon, env, log, otpSession } from './lib.mjs';
import { createClient } from '@supabase/supabase-js';

const STAMP = Date.now().toString().slice(-6);
const KEY = 'clave-de-prueba-' + STAMP;
const R = [];
const check = (nombre, ok, detalle = '') => { R.push(ok); log(`${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`); };

const marca = async (n) => {
  const { data, error } = await svc.from('brands').insert({
    slug: `e2e-pp-${STAMP}-${n}`, name: `E2E PayPal ${n}`, is_test: true, archived_at: new Date().toISOString(),
    moneda: 'USD', zona_horaria: 'America/New_York', metodo_manual: 'transferencia',
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
};
const B = await marca('a');
const B2 = await marca('b');
const { data: ev, error: eEv } = await svc.from('events').insert({
  brand_id: B, slug: `e2e-pp-${STAMP}`, name: 'E2E PayPal',
  starts_at: new Date(Date.now() + 15 * 864e5).toISOString(), ends_at: new Date(Date.now() + 15 * 864e5 + 8 * 36e5).toISOString(),
  venue_name: 'Local E2E', is_published: false, is_free: false, min_age: 0,
}).select('id').single();
if (eEv) throw new Error(eEv.message);
const { data: tt, error: eTt } = await svc.from('ticket_types').insert({
  event_id: ev.id, name: 'General', price_cents: 1234, capacity: 3, is_unlimited: false, max_scans: 1, is_active: true,
}).select('id, name').single();
if (eTt) throw new Error(eTt.message);

const QTY = 2, UNIT = 1234, TOTAL = QTY * UNIT;
const CLIENTE = `e2e-client-${STAMP}`;
const orden = async (ppOrder, cliente = CLIENTE) => {
  const { data, error } = await svc.from('orders').insert({
    event_id: ev.id, brand_id: B, buyer_name: 'E2E PP', buyer_email: `e2e-pp-${STAMP}@parygo.test`,
    buyer_phone: '999999999', buyer_age_ok: true, payment_method: 'paypal', status: 'pending_payment',
    subtotal_cents: TOTAL, total_cents: TOTAL, paypal_order_id: ppOrder, paypal_client_id: cliente,
  }).select('id').single();
  if (error) throw new Error(error.message);
  const it = await svc.from('order_items').insert({
    order_id: data.id, ticket_type_id: tt.id, ticket_type_name: tt.name, quantity: QTY, unit_price_cents: UNIT, subtotal_cents: TOTAL,
  });
  if (it.error) throw new Error(it.error.message);
  return data.id;
};
const settle = (cli, id, cap, cents = TOTAL, mon = 'USD') => cli.rpc('settle_paypal_payment', {
  p_order_id: id, p_brand_id: B, p_capture_id: cap, p_paid_cents: cents, p_currency: mon,
});
const refund = (cli, id, cap, motivo = 'refunded') => cli.rpc('refund_paypal_order', { p_order_id: id, p_brand_id: B, p_capture_id: cap, p_motivo: motivo });
const puede = (cli, id, pp, cliente = CLIENTE) => cli.rpc('puede_cobrar_paypal', { p_order_id: id, p_brand_id: B, p_paypal_order_id: pp, p_client_id: cliente });
const conectar = (cli, brand, cliente, sandbox = true) => cli.rpc('set_brand_paypal', {
  p_brand_id: brand, p_client_id: cliente, p_secret: 'secreto-' + STAMP, p_webhook_id: 'WH-' + STAMP, p_sandbox: sandbox, p_encryption_key: KEY,
});
const entradas = async (id) => (await svc.from('tickets').select('id, invalidated_at').eq('order_id', id)).data ?? [];
const estado = async (id) => (await svc.from('orders').select('status').eq('id', id).single()).data.status;
const sold = async () => (await svc.from('ticket_types').select('sold').eq('id', tt.id).single()).data.sold;

try {
  // ---------- 1. permisos por JWT real ----------
  const sesion = await otpSession('brandadmin.demotest@parygo.test');
  const auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${sesion.access_token}` } },
  });
  const o0 = await orden(`PP-${STAMP}-0`);
  for (const [quien, cli] of [['anon', anon()], ['brand_admin', auth]]) {
    const r = await Promise.all([
      settle(cli, o0, 'CAP-x'), refund(cli, o0, 'CAP-x'), puede(cli, o0, 'x'), conectar(cli, B, 'x'),
      cli.rpc('get_brand_paypal_credentials', { p_brand_id: B, p_encryption_key: KEY }),
      cli.rpc('clear_brand_paypal', { p_brand_id: B }),
    ]);
    check(`${quien} NO ejecuta ninguna de las 6 RPCs`, r.every((x) => !!x.error && !x.data), r.map((x) => x.error?.code).join(','));
    const l = await cli.from('brands').select('paypal_client_id, paypal_secret_enc').eq('id', B);
    check(`${quien} NO lee las columnas paypal_*`, !!l.error, l.error?.code ?? 'leyó');
  }
  check('los intentos sin permiso no tocaron nada', (await estado(o0)) === 'pending_payment' && (await entradas(o0)).length === 0);

  // ---------- 2. conectar ----------
  const c1 = await conectar(svc, B, CLIENTE);
  check('conectar con sandbox en marca de prueba → conectada', c1.data?.action === 'conectada', JSON.stringify(c1.data ?? c1.error));
  const cred = await svc.rpc('get_brand_paypal_credentials', { p_brand_id: B, p_encryption_key: KEY });
  check('las credenciales se descifran igual', cred.data?.[0]?.secret === 'secreto-' + STAMP && cred.data?.[0]?.client_id === CLIENTE && cred.data?.[0]?.moneda === 'USD');
  const { data: crudo } = await svc.from('brands').select('paypal_secret_enc').eq('id', B).single();
  check('el secret NO queda en claro', !String(crudo.paypal_secret_enc).includes('secreto-'));
  const c2 = await conectar(svc, B2, CLIENTE);
  check('la misma app en otra marca → cuenta_en_otra_marca', c2.data?.action === 'cuenta_en_otra_marca', JSON.stringify(c2.data));
  await svc.from('brands').update({ is_test: false }).eq('id', B2);
  const c3 = await conectar(svc, B2, `otro-${STAMP}`, true);
  check('sandbox en una marca real → sandbox_solo_prueba', c3.data?.action === 'sandbox_solo_prueba', JSON.stringify(c3.data ?? c3.error));
  await svc.from('brands').update({ is_test: true }).eq('id', B2);

  // ---------- 3. pago activo bloquea cambiar / desconectar ----------
  const cambio = await conectar(svc, B, `nuevo-${STAMP}`);
  check('cambiar de app con un pago activo → pago_activo', cambio.data?.action === 'pago_activo', JSON.stringify(cambio.data));
  const misma = await conectar(svc, B, CLIENTE);
  check('re-guardar la MISMA app con pago activo → pasa', misma.data?.action === 'conectada', JSON.stringify(misma.data));
  const desc = await svc.rpc('clear_brand_paypal', { p_brand_id: B });
  check('desconectar con un pago activo → pago_activo', desc.data?.action === 'pago_activo', JSON.stringify(desc.data));

  // ---------- 4. puede_cobrar ----------
  const p1 = await puede(svc, o0, 'PP-otra');
  check('otra orden de PayPal → otra_orden_paypal', p1.data?.action === 'otra_orden_paypal', JSON.stringify(p1.data));
  const p2 = await puede(svc, o0, `PP-${STAMP}-0`, `nuevo-${STAMP}`);
  check('otras credenciales → credenciales_cambiaron', p2.data?.action === 'credenciales_cambiaron', JSON.stringify(p2.data));
  const p3 = await puede(svc, o0, `PP-${STAMP}-0`);
  check('misma orden y credenciales con cupo → cobrar', p3.data?.action === 'cobrar' && p3.data?.total_cents === TOTAL, JSON.stringify(p3.data));

  // ---------- 5. settle ----------
  const mon = await settle(svc, o0, `CAP-${STAMP}-0`, TOTAL, 'EUR');
  check('otra moneda → currency_mismatch sin entradas', mon.data?.action === 'currency_mismatch' && (await entradas(o0)).length === 0, JSON.stringify(mon.data));
  const monto = await settle(svc, o0, `CAP-${STAMP}-0`, TOTAL - 1);
  check('otro monto → amount_mismatch sin entradas', monto.data?.action === 'amount_mismatch' && (await entradas(o0)).length === 0, JSON.stringify(monto.data));
  const ck = await svc.from('orders').update({ status: 'paid' }).eq('id', o0);
  check('CHECK: una orden paypal paid sin captura → rechazada', ck.error?.code === '23514', ck.error?.code);
  const sold0 = await sold();
  const cap0 = `CAP-${STAMP}-0`;
  const [x, y] = await Promise.all([settle(svc, o0, cap0), settle(svc, o0, cap0)]);
  const acc = [x.data?.action, y.data?.action].sort().join(',');
  check('dos liquidaciones a la vez → issued + already_issued', acc === 'already_issued,issued', acc);
  check(`exactamente ${QTY} entradas y sold +${QTY}`, (await entradas(o0)).length === QTY && (await sold()) === sold0 + QTY, `sold=${await sold()}`);
  const pg = await puede(svc, o0, `PP-${STAMP}-0`);
  check('una orden ya pagada no se vuelve a capturar', pg.data?.action === 'ya_pagada', JSON.stringify(pg.data));
  const dup = await settle(svc, o0, `CAP-${STAMP}-dup`);
  const { count: nDup } = await svc.from('events_log').select('id', { count: 'exact', head: true }).eq('order_id', o0).eq('type', 'paypal_duplicate_capture');
  check('otra captura sobre una orden emitida → duplicate_capture anotada', dup.data?.action === 'duplicate_capture' && nDup === 1, `${dup.data?.action} n=${nDup}`);

  // ---------- 6. sin cupo: no se captura; si ya se capturó, se devuelve ----------
  const o1 = await orden(`PP-${STAMP}-1`);
  const sc = await puede(svc, o1, `PP-${STAMP}-1`);
  check('sin cupo → puede_cobrar dice sin_cupo (no se captura)', sc.data?.action === 'sin_cupo', JSON.stringify(sc.data));
  const ajena = await settle(svc, o1, cap0);
  check('la captura de OTRA orden no liquida esta', ajena.data?.action === 'capture_de_otra_orden', JSON.stringify(ajena.data));
  const ov = await settle(svc, o1, `CAP-${STAMP}-1`);
  check('captura sin cupo → oversold_no_capacity sin entradas', ov.data?.action === 'oversold_no_capacity' && (await entradas(o1)).length === 0, JSON.stringify(ov.data));
  const auto = await refund(svc, o1, `CAP-${STAMP}-1`, 'auto');
  const { count: nAuto } = await svc.from('events_log').select('id', { count: 'exact', head: true }).eq('order_id', o1).eq('type', 'paypal_auto_refund');
  check('devolución automática → refunded con la captura anotada', auto.data?.action === 'refunded_sin_entradas' && (await estado(o1)) === 'refunded' && nAuto === 1, JSON.stringify(auto.data));
  const aviso = await refund(svc, o1, `CAP-${STAMP}-1`);
  check('el aviso de PayPal de esa devolución no hace nada más', aviso.data?.action === 'refunded' && aviso.data?.tickets_anuladas === 0, JSON.stringify(aviso.data));

  // ---------- 7. reembolso de una orden emitida ----------
  const otra = await refund(svc, o0, `CAP-${STAMP}-dup`);
  check('devolver OTRA captura no anula nada', otra.data?.action === 'capture_mismatch' && (await entradas(o0)).every((t) => !t.invalidated_at), JSON.stringify(otra.data));
  const antes = await sold();
  const r1 = await refund(svc, o0, cap0);
  check('reembolso → refunded y entradas anuladas', r1.data?.action === 'refunded' && r1.data?.tickets_anuladas === QTY && (await estado(o0)) === 'refunded', JSON.stringify(r1.data));
  check(`sold bajó ${QTY}`, (await sold()) === antes - QTY, `sold=${await sold()}`);
  const r2 = await refund(svc, o0, cap0);
  check('repetir el reembolso no hace nada', r2.data?.tickets_anuladas === 0, JSON.stringify(r2.data));
  const tarde = await settle(svc, o0, cap0);
  check('una liquidación atrasada no resucita la orden devuelta', tarde.data?.action === 'refunded' && (await estado(o0)) === 'refunded', JSON.stringify(tarde.data));

  // ---------- 8. reembolso + liquidación a la vez ----------
  const o2 = await orden(`PP-${STAMP}-2`);
  const cap2 = `CAP-${STAMP}-2`;
  await settle(svc, o2, cap2);
  await Promise.all([refund(svc, o2, cap2), settle(svc, o2, cap2)]);
  const est = await estado(o2), tk = await entradas(o2);
  const coherente = (est === 'refunded' && tk.every((t) => t.invalidated_at)) || (est === 'paid' && tk.every((t) => !t.invalidated_at));
  check('reembolso + liquidación a la vez → estado coherente', coherente, `${est} anuladas=${tk.filter((t) => t.invalidated_at).length}/${tk.length}`);

  // ---------- 9. desconectar sin pagos activos ----------
  await svc.from('orders').update({ status: 'expired' }).eq('brand_id', B).eq('status', 'pending_payment');
  const d2 = await svc.rpc('clear_brand_paypal', { p_brand_id: B });
  const { data: tras } = await svc.from('brands').select('paypal_client_id, paypal_secret_enc, paypal_sandbox').eq('id', B).single();
  check('desconectar sin pagos activos → limpia todo', d2.data?.action === 'desconectada' && !tras.paypal_client_id && !tras.paypal_secret_enc && !tras.paypal_sandbox, JSON.stringify(d2.data));
} finally {
  const { data: ords } = await svc.from('orders').select('id').in('brand_id', [B, B2]);
  for (const { id } of ords ?? []) {
    await svc.from('tickets').delete().eq('order_id', id);
    await svc.from('promo_redemptions').delete().eq('order_id', id);
    await svc.from('stock_reservations').delete().eq('order_id', id);
    await svc.from('order_items').delete().eq('order_id', id);
  }
  await svc.from('events_log').delete().in('brand_id', [B, B2]);
  await svc.from('orders').delete().in('brand_id', [B, B2]);
  await svc.from('ticket_types').delete().eq('event_id', ev.id);
  await svc.from('events').delete().in('brand_id', [B, B2]);
  const d = await svc.from('brands').delete().in('id', [B, B2]);
  check('marcas temporales borradas', !d.error, d.error?.message);
}

const fallas = R.filter((x) => !x).length;
log(`${R.length - fallas}/${R.length} OK`);
process.exit(fallas ? 1 : 0);
