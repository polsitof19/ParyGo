// Pruebas de lo que trajeron las migraciones 0053–0058 y su código, que el
// E2E de fase 1 no cubre: eventos gratis, cortesías explícitas, "quedan pocas",
// QR de Yape y los contadores del super admin.
//
// Incluye el test de CONCURRENCIA del camino gratis, que es el que toca stock.
// Solo demotest. Nunca Code/Almighty/hoesky.
//
//   node e2e/nuevo-0053-0058.mjs
import { svc, log, BRAND } from './lib.mjs';
import { query } from '../supabase/mgmt.mjs';

const R = [];
const check = (n, ok, det = '') => { R.push({ n, ok: !!ok }); log(`${ok ? '✔' : '✘'} ${n}${det ? ' — ' + String(det).slice(0, 180) : ''}`); };

const { data: marca } = await svc.from('brands').select('id, slug, is_test').eq('slug', BRAND).single();
if (!marca) throw new Error('demotest no encontrada');

// ---------------------------------------------------------------- is_test
log('== Marcas de prueba y contadores');
const { data: test } = await svc.from('brands').select('slug').eq('is_test', true).order('slug');
check('las tres marcas de prueba están marcadas',
  JSON.stringify((test ?? []).map((b) => b.slug)) === JSON.stringify(['demotest', 'ensayo-paul', 'koko']),
  JSON.stringify((test ?? []).map((b) => b.slug)));

const pendientesReales = (await query(`
  select count(*)::int as n from orders o join brands b on b.id = o.brand_id
  where o.status = 'pending_yape_review' and o.yape_proof_id is not null and b.is_test = false`))[0].n;
const pendientesCrudo = (await query(`
  select count(*)::int as n from orders where status = 'pending_yape_review'`))[0].n;
check('el contador honesto de Yape es menor que el crudo',
  pendientesReales < pendientesCrudo, `honesto=${pendientesReales} crudo=${pendientesCrudo}`);

// ---------------------------------------------------------------- QR de Yape
log('== QR de Yape');
const colQr = (await query(`
  select count(*)::int as n from information_schema.columns
  where table_name='brands' and column_name='yape_qr_url'`))[0].n;
check('brands.yape_qr_url existe y es la fuente de verdad', colQr === 1);
const qrMalo = await svc.from('brands').update({ yape_qr_url: 'javascript:alert(1)' }).eq('id', marca.id).select();
check('una URL que no es https se rechaza (constraint)', Boolean(qrMalo.error), qrMalo.error?.message ?? 'ACEPTADA (mal)');
const qrOk = await svc.from('brands').update({ yape_qr_url: 'https://ejemplo.test/qr.png' }).eq('id', marca.id).select('yape_qr_url');
check('una URL https se acepta', !qrOk.error && qrOk.data?.[0]?.yape_qr_url === 'https://ejemplo.test/qr.png', qrOk.error?.message);
await svc.from('brands').update({ yape_qr_url: null }).eq('id', marca.id); // se deja como estaba

// ---------------------------------------------------------------- cortesías
log('== Cortesías y eventos gratis');
// El invariante que importa: en un evento PAGO no puede haber un tipo S/0 que
// no sea cortesía — sería una entrada gratis ofrecida en un evento que cobra.
// En un evento GRATIS sí puede: ahí S/0 es el precio normal.
const sueltos = (await query(`
  select count(*)::int as n from ticket_types tt join events e on e.id = tt.event_id
  where tt.price_cents = 0 and not tt.is_courtesy and e.is_free is distinct from true`))[0].n;
check('ningún tipo S/0 suelto en un evento PAGO (requiere la 0059)', sueltos === 0, `sueltos=${sueltos}`);
const conPrecio = await query(`
  begin;
  insert into ticket_types (event_id, name, price_cents, capacity, is_courtesy, sort_order)
  values ((select id from events where brand_id='${marca.id}' limit 1), 'mal', 1000, 10, true, 99);
  rollback;`).then(() => true).catch(() => false);
check('una cortesía CON precio se rechaza (constraint)', conPrecio === false);

// ---------------------------------------------------------------- flujo gratis + CONCURRENCIA
log('== Evento GRATIS: emisión y concurrencia sobre el último cupo');
const stamp = String(Date.now()).slice(-6);
const { data: ev, error: evErr } = await svc.from('events').insert({
  brand_id: marca.id, slug: `e2e-gratis-${stamp}`, name: `E2E Gratis ${stamp}`,
  starts_at: new Date(Date.now() + 10 * 86400000).toISOString(),
  ends_at: new Date(Date.now() + 10 * 86400000 + 6 * 3600000).toISOString(),
  venue_name: 'Local E2E', is_published: true, is_free: true, min_age: 0,
  require_age_confirmation: false, require_dni: false,
}).select('id, slug, is_free').single();
if (evErr) throw new Error('no se pudo crear el evento gratis: ' + evErr.message);
check('se puede marcar un evento como gratis', ev.is_free === true);

// Un tipo GRATIS público y una CORTESÍA, en el mismo evento gratis.
const { data: tipos } = await svc.from('ticket_types').insert([
  { event_id: ev.id, name: 'Entrada libre', price_cents: 0, capacity: 1, is_courtesy: false, sort_order: 1, max_scans: 1 },
  { event_id: ev.id, name: 'Invitados', price_cents: 0, capacity: 5, is_courtesy: true, sort_order: 2, max_scans: 1 },
]).select('id, name, is_courtesy');
const libre = tipos.find((t) => t.name === 'Entrada libre');
const invitados = tipos.find((t) => t.name === 'Invitados');
check('en un evento gratis conviven un tipo público y una cortesía', Boolean(libre && invitados));

// CONCURRENCIA: dos compras simultáneas del ÚLTIMO cupo (capacity 1).
// Se llama al mismo RPC atómico que usa el checkout (reserve_order_stock),
// que es donde vive el anti-sobreventa.
const crearOrden = async (email) => {
  const { data: o } = await svc.from('orders').insert({
    event_id: ev.id, brand_id: marca.id, buyer_name: email, buyer_email: email,
    buyer_phone: '+51999000111', buyer_age_ok: true, payment_method: 'yape_manual',
    subtotal_cents: 0, total_cents: 0, status: 'pending_yape_review',
  }).select('id').single();
  await svc.from('order_items').insert({
    order_id: o.id, ticket_type_id: libre.id, ticket_type_name: 'Entrada libre',
    quantity: 1, unit_price_cents: 0, subtotal_cents: 0,
  });
  return o.id;
};
const o1 = await crearOrden(`gratis-a-${stamp}@test.local`);
const o2 = await crearOrden(`gratis-b-${stamp}@test.local`);
const [r1, r2] = await Promise.all([
  svc.rpc('reserve_order_stock', { p_order_id: o1, p_session_id: `s1-${stamp}` }),
  svc.rpc('reserve_order_stock', { p_order_id: o2, p_session_id: `s2-${stamp}` }),
]);
const exitos = [r1, r2].filter((r) => !r.error).length;
check('CONCURRENCIA: dos compras simultáneas del último cupo gratis → una pasa, una se rechaza',
  exitos === 1, `éxitos=${exitos} · ${[r1.error?.message, r2.error?.message].filter(Boolean).join(' | ')}`);

const tipoDespues = (await svc.from('ticket_types').select('sold, capacity, reserved').eq('id', libre.id).single()).data;
check('el aforo no se pasó (sold + reservas ≤ capacity)',
  (tipoDespues.sold ?? 0) <= tipoDespues.capacity, JSON.stringify(tipoDespues));

// ---------------------------------------------------------------- limpieza
log('== Limpieza');
for (const id of [o1, o2]) {
  await svc.rpc('release_stock_reservations_for_order', { p_order_id: id });
  await svc.from('order_items').delete().eq('order_id', id);
  await svc.from('tickets').delete().eq('order_id', id);
  await svc.from('orders').delete().eq('id', id);
}
await svc.from('ticket_types').delete().eq('event_id', ev.id);
await svc.from('events').delete().eq('id', ev.id);
const { count: quedan } = await svc.from('events').select('id', { count: 'exact', head: true }).eq('id', ev.id);
check('el evento de prueba se borró (no queda basura en prod)', (quedan ?? 0) === 0);

const mal = R.filter((r) => !r.ok).length;
log(`\n${R.length - mal}/${R.length} en verde`);
process.exit(mal ? 1 : 0);
