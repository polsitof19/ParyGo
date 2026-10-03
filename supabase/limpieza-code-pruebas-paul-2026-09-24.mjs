// Pruebas de Paul (buyer_name "Paul Esquivel", polsitof19@…) en Standly en
// Cocos, 2026-09-24. Mismo criterio que limpieza-code-lanzamiento-2026-09-23:
// respaldo, entradas anuladas (el trigger 0032 descuenta `sold`), la orden
// pagada pasa a refunded y la pendiente de revisión a failed. No se borra nada.
// Uso: node supabase/limpieza-code-pruebas-paul-2026-09-24.mjs          (mira)
//      node supabase/limpieza-code-pruebas-paul-2026-09-24.mjs --write  (aplica)
import { writeFileSync, mkdirSync } from 'node:fs';
import { svc } from '../e2e/lib.mjs';

const WRITE = process.argv.includes('--write');
const EV = '4d0c3276-880e-4318-ae27-61793d1ec2c4'; // Standly en Cocos
const PAGADA = '0700345a-d338-463e-9220-7eae209a42c0';
const PENDIENTE = 'c8ef4a14-7013-4a82-8359-56055ce80782';

const { data: ords } = await svc.from('orders').select('*').in('id', [PAGADA, PENDIENTE]);
if (ords.length !== 2 || ords.some((o) => o.event_id !== EV || o.buyer_name !== 'Paul Esquivel')) {
  console.log('Las órdenes no son las esperadas, no se toca nada:', ords.map((o) => [o.id, o.buyer_name, o.status]));
  process.exit(1);
}
const { data: tks } = await svc.from('tickets').select('*').in('order_id', [PAGADA, PENDIENTE]);
const { data: scans } = await svc.from('ticket_scans').select('*').in('ticket_id', tks.map((t) => t.id).concat(['00000000-0000-0000-0000-000000000000']));
const { data: tt } = await svc.from('ticket_types').select('id, name, sold, reserved').eq('event_id', EV);
console.log('órdenes:', ords.map((o) => `${o.status} ${o.buyer_email} S/${o.total_cents / 100}`));
console.log('entradas:', tks.length, '· válidas:', tks.filter((t) => !t.invalidated_at).length, '· escaneos:', scans.length);
console.log('contador ANTES:', tt.map((t) => `${t.name} sold=${t.sold}`));
if (!WRITE) { console.log('\n(solo mirando; con --write se aplica)'); process.exit(0); }

mkdirSync('tmp/respaldos', { recursive: true });
const archivo = `tmp/respaldos/code-pruebas-paul-${Date.now()}.json`;
writeFileSync(archivo, JSON.stringify({ ords, tks, scans, tt }, null, 2));
console.log('respaldo:', archivo);

const ahora = new Date().toISOString();
const validas = tks.filter((t) => !t.invalidated_at);
if (validas.length) {
  const { error } = await svc.from('tickets').update({ invalidated_at: ahora }).in('id', validas.map((t) => t.id)).is('invalidated_at', null);
  if (error) throw error;
  await svc.from('events_log').insert(validas.map((t) => ({ brand_id: t.brand_id, event_id: EV, ticket_id: t.id, order_id: t.order_id, type: 'ticket_voided', payload: { ticket_number: t.ticket_number, reason: 'Prueba de Paul' } })));
}
const r1 = await svc.from('orders').update({ status: 'refunded' }).eq('id', PAGADA).eq('status', 'paid');
if (r1.error) throw r1.error;
const r2 = await svc.from('orders').update({ status: 'failed' }).eq('id', PENDIENTE).eq('status', 'pending_yape_review');
if (r2.error) throw r2.error;

const { data: tt2 } = await svc.from('ticket_types').select('name, sold, reserved').eq('event_id', EV);
const { data: o2 } = await svc.from('orders').select('status').in('id', [PAGADA, PENDIENTE]);
const { data: tk2 } = await svc.from('tickets').select('id').in('order_id', [PAGADA, PENDIENTE]).is('invalidated_at', null);
console.log('DESPUÉS → órdenes:', o2.map((o) => o.status), '· entradas válidas:', tk2.length, '· contador:', tt2.map((t) => `${t.name} sold=${t.sold}`));
