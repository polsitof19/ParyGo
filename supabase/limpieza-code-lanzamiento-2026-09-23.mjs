// Limpieza de lanzamiento de Code (pedido de Paul, 2026-09-23): deja SOLO
// "Standly en Cocos" en cero.
//   - respaldo JSON de órdenes, entradas y escaneos del evento
//   - anula las entradas válidas (como el botón "Anular" del panel)
//   - las órdenes de PRUEBA salen de la lista de ventas (status refunded; no se
//     borra nada)
//   - archiva los eventos que ya pasaron (Almighty)
// Uso: node supabase/limpieza-code-lanzamiento-2026-09-23.mjs          (mira)
//      node supabase/limpieza-code-lanzamiento-2026-09-23.mjs --write  (aplica)
import { writeFileSync, mkdirSync } from 'node:fs';
import { svc } from '../e2e/lib.mjs';

const WRITE = process.argv.includes('--write');
const EV = '4d0c3276-880e-4318-ae27-61793d1ec2c4'; // Standly en Cocos
const PRUEBA = ['paulsebastian439@gmail.com', 'paulsebastian439@gmail.con', 'mrpandapro3@gmail.com'];

const { data: brand } = await svc.from('brands').select('id, slug').eq('slug', 'code').single();
const { data: evs } = await svc.from('events').select('id, name, starts_at, archived_at, is_published').eq('brand_id', brand.id);
const { data: ords } = await svc.from('orders').select('*').eq('event_id', EV);
const { data: tks } = await svc.from('tickets').select('*').eq('event_id', EV);
const { data: scans } = await svc.from('ticket_scans').select('*').eq('event_id', EV);
const { data: tt } = await svc.from('ticket_types').select('id, name, sold, reserved').eq('event_id', EV);

const ajenas = (ords ?? []).filter((o) => !PRUEBA.includes(String(o.buyer_email).toLowerCase()));
console.log('eventos de Code:', evs.map((e) => `${e.name} (${e.starts_at.slice(0, 10)}${e.archived_at ? ', archivado' : ''})`));
console.log('órdenes de Standly:', ords.length, '· de prueba:', ords.length - ajenas.length, '· de OTRAS personas:', ajenas.length);
if (ajenas.length) { console.log('HAY ÓRDENES DE OTRAS PERSONAS, NO SE TOCA NADA:', ajenas.map((o) => o.buyer_email)); process.exit(1); }
console.log('entradas:', tks.length, '· válidas:', tks.filter((t) => !t.invalidated_at).length, '· escaneos:', scans.length, '· contador:', tt.map((t) => `${t.name} sold=${t.sold}`));
const pasados = evs.filter((e) => e.id !== EV && !e.archived_at && Date.parse(e.starts_at) < Date.now());
console.log('eventos pasados a archivar:', pasados.map((e) => e.name));
if (!WRITE) { console.log('\n(solo mirando; con --write se aplica)'); process.exit(0); }

mkdirSync('tmp/respaldos', { recursive: true });
const archivo = `tmp/respaldos/code-standly-${Date.now()}.json`;
writeFileSync(archivo, JSON.stringify({ ords, tks, scans, tt, evs }, null, 2));
console.log('respaldo:', archivo);

const ahora = new Date().toISOString();
const validas = tks.filter((t) => !t.invalidated_at);
if (validas.length) {
  const { error } = await svc.from('tickets').update({ invalidated_at: ahora }).in('id', validas.map((t) => t.id)).is('invalidated_at', null);
  if (error) throw error;
  await svc.from('events_log').insert(validas.map((t) => ({ brand_id: brand.id, event_id: EV, ticket_id: t.id, order_id: t.order_id, type: 'ticket_voided', payload: { ticket_number: t.ticket_number, reason: 'Prueba de ParyGo antes del lanzamiento' } })));
}
const { error: eo } = await svc.from('orders').update({ status: 'refunded' }).in('id', ords.map((o) => o.id)).eq('status', 'paid');
if (eo) throw eo;
for (const e of pasados) {
  const { error } = await svc.from('events').update({ archived_at: ahora, is_published: false }).eq('id', e.id);
  if (error) throw error;
}

const { data: tt2 } = await svc.from('ticket_types').select('name, sold, reserved').eq('event_id', EV);
const { data: tks2 } = await svc.from('tickets').select('id').eq('event_id', EV).is('invalidated_at', null);
const { data: pagas } = await svc.from('orders').select('id').eq('event_id', EV).eq('status', 'paid');
const { data: evs2 } = await svc.from('events').select('name, archived_at, is_published').eq('brand_id', brand.id);
console.log('DESPUÉS → entradas válidas:', tks2.length, '· órdenes pagadas:', pagas.length, '· contador:', tt2, '· eventos:', evs2);
