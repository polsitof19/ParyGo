// LÍMITE POR PERSONA (migración 0060) — pruebas contra la base REAL, en demotest.
//
//   node e2e/limite-por-persona.mjs
//
// Qué cubre, y por qué cada una:
//   1. sin límite (NULL) el comportamiento no cambia;
//   2. el límite cuenta ENTRADAS, no órdenes (dos reclamos de 1 con el mismo
//      email suman 2);
//   3. el mismo DOCUMENTO con OTRO email también topea (si no, el límite es
//      decorativo: cambiar de correo es gratis);
//   4. CONCURRENCIA: dos reclamos simultáneos del último cupo de la persona →
//      uno pasa y el otro se rechaza. Sin el advisory lock de la 0060 pasan los
//      dos, que es el bug que este archivo existe para que no vuelva;
//   5. una orden pendiente cuyo hold ya venció DEJA de contar (un checkout
//      abandonado no puede dejar a alguien afuera del evento para siempre);
//   6. el límite es POR EVENTO (otro evento arranca de cero).
import { svc, log } from './lib.mjs';

const STAMP = String(Date.now()).slice(-6);
const fallos = [];
const check = (nombre, cond, detalle = '') => {
  if (!cond) fallos.push(nombre);
  log(`${cond ? '✔' : '✘'} ${nombre}${detalle ? ' — ' + String(detalle).slice(0, 220) : ''}`);
};

const { data: marca } = await svc.from('brands').select('id').eq('slug', 'demotest').single();
if (!marca) throw new Error('demotest no encontrada');

// ---------- armado: dos eventos gratis, uno con límite 2 y otro sin límite ----------
async function crearEvento({ limite, sufijo }) {
  const inicio = new Date(Date.now() + 12 * 86400000);
  const { data: ev, error } = await svc.from('events').insert({
    brand_id: marca.id,
    slug: `e2e-limite-${sufijo}-${STAMP}`,
    name: `E2E Límite ${sufijo} ${STAMP}`,
    starts_at: inicio.toISOString(),
    ends_at: new Date(inicio.getTime() + 7 * 3600000).toISOString(),
    venue_name: 'Local E2E', is_published: true, is_free: true, min_age: 0,
    max_per_person: limite,
  }).select('id, max_per_person').single();
  if (error) throw new Error(`evento ${sufijo}: ${error.message}`);
  const { data: tt, error: ttErr } = await svc.from('ticket_types').insert({
    event_id: ev.id, name: 'Entrada', price_cents: 0, capacity: 100,
    is_active: true, is_unlimited: false, is_courtesy: false, max_scans: 1, sort_order: 1,
  }).select('id').single();
  if (ttErr) throw new Error(`tipo ${sufijo}: ${ttErr.message}`);
  return { ...ev, ticketTypeId: tt.id };
}

const conLimite = await crearEvento({ limite: 2, sufijo: 'con' });
const sinLimite = await crearEvento({ limite: null, sufijo: 'sin' });
check('la columna acepta el límite y el NULL', conLimite.max_per_person === 2 && sinLimite.max_per_person === null,
  `con=${conLimite.max_per_person} sin=${sinLimite.max_per_person}`);

// Crea una orden pendiente + sus líneas, tal como lo hace startCheckout ANTES
// de llamar a reserve_order_stock. Devuelve el id.
async function crearOrden(ev, { email, dni, qty = 1 }) {
  const { data: o, error } = await svc.from('orders').insert({
    event_id: ev.id, brand_id: marca.id,
    buyer_name: 'Límite E2E', buyer_email: email, buyer_phone: '+51999111222',
    buyer_dni: dni, buyer_doc_type: 'dni', buyer_age_ok: true, marketing_opt_in: false,
    payment_method: 'yape_manual', subtotal_cents: 0, total_cents: 0, discount_cents: 0,
    status: 'pending_yape_review',
  }).select('id').single();
  if (error) throw new Error('orden: ' + error.message);
  const { error: iErr } = await svc.from('order_items').insert({
    order_id: o.id, ticket_type_id: ev.ticketTypeId, ticket_type_name: 'Entrada',
    quantity: qty, unit_price_cents: 0, subtotal_cents: 0,
  });
  if (iErr) throw new Error('items: ' + iErr.message);
  return o.id;
}

const reservar = (orderId, sesion) =>
  svc.rpc('reserve_order_stock', { p_order_id: orderId, p_session_id: sesion });

const esLimite = (err) => Boolean(err && /per_person_limit/.test(err.message ?? ''));

// ---------- 1. sin límite: cinco reclamos del mismo email pasan ----------
{
  const email = `limite-sin-${STAMP}@test.local`;
  let ok = 0;
  for (let i = 0; i < 5; i++) {
    const id = await crearOrden(sinLimite, { email, dni: '11111111' });
    const { error } = await reservar(id, `sesion-sin-${STAMP}-${i}`);
    if (!error) ok += 1;
  }
  check('sin límite (NULL): 5 reclamos del mismo email pasan igual que siempre', ok === 5, `pasaron ${ok}/5`);
}

// ---------- 2. el límite cuenta ENTRADAS, no órdenes ----------
const emailA = `limite-a-${STAMP}@test.local`;
{
  const id1 = await crearOrden(conLimite, { email: emailA, dni: '22222222' });
  const r1 = await reservar(id1, `sesion-a1-${STAMP}`);
  const id2 = await crearOrden(conLimite, { email: emailA, dni: '22222222' });
  const r2 = await reservar(id2, `sesion-a2-${STAMP}`);
  const id3 = await crearOrden(conLimite, { email: emailA, dni: '22222222' });
  const r3 = await reservar(id3, `sesion-a3-${STAMP}`);
  check('con límite 2: la 1ª y la 2ª entrada pasan', !r1.error && !r2.error, `${r1.error?.message ?? 'ok'} / ${r2.error?.message ?? 'ok'}`);
  check('con límite 2: la 3ª se rechaza con per_person_limit', esLimite(r3.error), r3.error?.message ?? 'PASÓ (mal)');
}

// ---------- 3. mismo DNI, otro email ----------
{
  const id = await crearOrden(conLimite, { email: `limite-otro-${STAMP}@test.local`, dni: '22222222' });
  const { error } = await reservar(id, `sesion-dni-${STAMP}`);
  check('mismo documento con OTRO email: también topea', esLimite(error), error?.message ?? 'PASÓ (mal)');
}

// ---------- 4. mismo email, otro DNI ----------
{
  const id = await crearOrden(conLimite, { email: emailA, dni: '99999999' });
  const { error } = await reservar(id, `sesion-email-${STAMP}`);
  check('mismo email con OTRO documento: también topea', esLimite(error), error?.message ?? 'PASÓ (mal)');
}

// ---------- 5. CONCURRENCIA: dos reclamos simultáneos del último cupo ----------
{
  const email = `limite-conc-${STAMP}@test.local`;
  const dni = '33333333';
  // Primera entrada consumida: queda UNA sola disponible para esta persona.
  const previo = await crearOrden(conLimite, { email, dni });
  await reservar(previo, `sesion-conc-previo-${STAMP}`);

  const idA = await crearOrden(conLimite, { email, dni });
  const idB = await crearOrden(conLimite, { email, dni });
  const [ra, rb] = await Promise.all([
    reservar(idA, `sesion-conc-a-${STAMP}`),
    reservar(idB, `sesion-conc-b-${STAMP}`),
  ]);
  const pasaron = [ra, rb].filter((r) => !r.error).length;
  const rechazados = [ra, rb].filter((r) => esLimite(r.error)).length;
  check('CONCURRENCIA: dos reclamos simultáneos del último cupo → uno pasa, uno se rechaza',
    pasaron === 1 && rechazados === 1,
    `pasaron=${pasaron} rechazados=${rechazados} · ${ra.error?.message ?? 'ok'} | ${rb.error?.message ?? 'ok'}`);

  const { data: tot } = await svc.from('orders').select('id, order_items(quantity)').eq('event_id', conLimite.id).eq('buyer_email', email);
  const vivas = [];
  for (const o of tot ?? []) {
    const { data: sr } = await svc.from('stock_reservations').select('id').eq('order_id', o.id).gt('expires_at', new Date().toISOString());
    if ((sr ?? []).length) vivas.push(o);
  }
  const entradas = vivas.reduce((s, o) => s + (o.order_items ?? []).reduce((a, i) => a + i.quantity, 0), 0);
  check('tras la concurrencia, esa persona tiene EXACTAMENTE 2 entradas retenidas (no 3)', entradas === 2, `entradas=${entradas}`);
}

// ---------- 6. una pendiente VENCIDA deja de contar ----------
{
  const email = `limite-vencida-${STAMP}@test.local`;
  const dni = '44444444';
  const id1 = await crearOrden(conLimite, { email, dni });
  await reservar(id1, `sesion-venc-1-${STAMP}`);
  const id2 = await crearOrden(conLimite, { email, dni });
  await reservar(id2, `sesion-venc-2-${STAMP}`);
  const id3 = await crearOrden(conLimite, { email, dni });
  const bloqueada = await reservar(id3, `sesion-venc-3-${STAMP}`);
  check('con dos holds vivos, la tercera se rechaza', esLimite(bloqueada.error), bloqueada.error?.message ?? 'PASÓ (mal)');
  // Vencer los dos holds a mano (es lo que hace el TTL de 30 min).
  await svc.from('stock_reservations').update({ expires_at: new Date(Date.now() - 60000).toISOString() }).in('order_id', [id1, id2]);
  const id4 = await crearOrden(conLimite, { email, dni });
  const libre = await reservar(id4, `sesion-venc-4-${STAMP}`);
  check('con los holds vencidos, la persona puede volver a reclamar', !libre.error, libre.error?.message ?? 'ok');
}

// ---------- 7. el límite es por EVENTO ----------
{
  const id = await crearOrden(sinLimite, { email: emailA, dni: '22222222' });
  const { error } = await reservar(id, `sesion-otroev-${STAMP}`);
  check('el tope es POR EVENTO: en otro evento la misma persona arranca de cero', !error, error?.message ?? 'ok');
}

// ---------- 8. las CORTESÍAS del organizador no entran en el tope (0061) ----------
{
  const email = `limite-cortesia-${STAMP}@test.local`;
  const dni = '55555555';
  // El organizador regala 4 cortesías de una, con el límite en 2.
  const { data: o, error } = await svc.from('orders').insert({
    event_id: conLimite.id, brand_id: marca.id,
    buyer_name: 'Invitado del organizador', buyer_email: email, buyer_phone: '+51999111222',
    buyer_dni: dni, buyer_doc_type: 'dni', buyer_age_ok: true, marketing_opt_in: false,
    payment_method: 'courtesy', subtotal_cents: 0, total_cents: 0, discount_cents: 0,
    status: 'pending_yape_review',
  }).select('id').single();
  if (error) throw new Error('orden cortesía: ' + error.message);
  await svc.from('order_items').insert({
    order_id: o.id, ticket_type_id: conLimite.ticketTypeId, ticket_type_name: 'Entrada',
    quantity: 4, unit_price_cents: 0, subtotal_cents: 0,
  });
  const cortesia = await reservar(o.id, `sesion-cortesia-${STAMP}`);
  check('el organizador puede emitir 4 cortesías aunque el tope sea 2', !cortesia.error, cortesia.error?.message ?? 'ok');

  // Y haber recibido cortesías no te quita el derecho a reclamar tu entrada.
  const idPub = await crearOrden(conLimite, { email, dni });
  const publico = await reservar(idPub, `sesion-cortesia-pub-${STAMP}`);
  check('recibir cortesías no consume el cupo personal del público', !publico.error, publico.error?.message ?? 'ok');
}

// ---------- limpieza ----------
const ahora = new Date().toISOString();
for (const ev of [conLimite, sinLimite]) {
  await svc.from('events').update({ archived_at: ahora, is_published: false }).eq('id', ev.id);
}
log(`\neventos de prueba archivados. ${fallos.length ? 'FALLAS: ' + fallos.join(' | ') : 'TODO VERDE'}`);
process.exit(fallos.length ? 1 : 0);
