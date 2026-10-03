// Borra el evento de PRUEBA "semaforo" de Code (Paul, 2026-10-03: "creé un
// evento llamado semáforo de prueba de code, elimínalo"). Su única orden es la
// compra de prueba de Paul (2 entradas, Yape S/40, sin escanear). Respaldo
// completo en tmp/respaldos/ antes de borrar. El crédito que gastó al crearse
// vuelve al saldo de Code (era una prueba).
//   node supabase/borrar-semaforo-code-2026-10-03.mjs
import { writeFileSync } from 'node:fs';
import { svc } from '../e2e/lib.mjs';

const EVENTO = '149b37b2-a066-4241-8c7c-339d414d2f9d';
const { data: ev } = await svc.from('events').select('*, brand:brands(slug, event_balance)').eq('id', EVENTO).single();
if (ev?.brand?.slug !== 'code' || ev.slug !== 'semaforo') throw new Error('no es el evento esperado');

const { data: ordenes } = await svc.from('orders').select('*').eq('event_id', EVENTO);
const ids = (ordenes ?? []).map((o) => o.id);
if (ordenes.some((o) => o.buyer_email !== 'paulsebastian439@gmail.com')) throw new Error('hay una orden que no es de Paul: no se borra');
const [tipos, items, entradas, comprobantes, escaneos, bitacora] = await Promise.all([
  svc.from('ticket_types').select('*').eq('event_id', EVENTO),
  svc.from('order_items').select('*').in('order_id', ids),
  svc.from('tickets').select('*').eq('event_id', EVENTO),
  svc.from('yape_proofs').select('*').in('order_id', ids),
  svc.from('ticket_scans').select('*').eq('event_id', EVENTO),
  svc.from('events_log').select('*').eq('event_id', EVENTO),
]);
if ((escaneos.data ?? []).length) throw new Error('tiene escaneos: no se borra');
const archivo = `tmp/respaldos/code-semaforo-${Date.now()}.json`;
writeFileSync(archivo, JSON.stringify({ evento: ev, tipos: tipos.data, ordenes, items: items.data, entradas: entradas.data, comprobantes: comprobantes.data, bitacora: bitacora.data }, null, 2));
console.log('respaldo:', archivo);

// Entradas → órdenes (cascada: ítems, comprobantes, correos, reservas) → evento (cascada: tipos, fases…).
for (const [paso, r] of [
  ['entradas', await svc.from('tickets').delete().eq('event_id', EVENTO)],
  ['ordenes', await svc.from('orders').delete().eq('event_id', EVENTO)],
  ['evento', await svc.from('events').delete().eq('id', EVENTO)],
]) if (r.error) throw new Error(`${paso}: ${r.error.message}`);

// Comprobante de Yape (archivo en storage), si la ruta es del bucket.
for (const c of comprobantes.data ?? []) {
  const m = /\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/.exec(c.receipt_url ?? '');
  if (m) {
    const { error } = await svc.storage.from(m[1]).remove([decodeURIComponent(m[2])]);
    console.log('comprobante', error ? `no se borró: ${error.message}` : 'borrado');
  } else if (c.receipt_url) {
    const { error } = await svc.storage.from('yape-proofs').remove([c.receipt_url]);
    console.log('comprobante', error ? `no se borró: ${error.message}` : 'borrado');
  }
}

const antes = ev.brand.event_balance;
const { error: eSaldo } = await svc.from('brands').update({ event_balance: antes + 1 }).eq('slug', 'code').eq('event_balance', antes);
if (eSaldo) throw new Error('saldo: ' + eSaldo.message);
await svc.from('events_log').insert({ brand_id: ev.brand_id, type: 'event_balance_restored', payload: { motivo: 'evento de prueba semaforo borrado a pedido de Paul', antes, despues: antes + 1, respaldo: archivo } });

const { count } = await svc.from('events').select('id', { count: 'exact', head: true }).eq('id', EVENTO);
const { data: b } = await svc.from('brands').select('event_balance').eq('slug', 'code').single();
console.log(`evento borrado: ${count === 0} · saldo de Code ${antes} → ${b.event_balance}`);
