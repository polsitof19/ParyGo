// Reparación puntual (2026-09-23): la única entrada del evento publicado y
// GRATIS de Code quedó marcada como cortesía a las 18:40 y la página de compra
// se quedó sin entradas. Se vuelve a su estado anterior (pública).
import { svc } from '../e2e/lib.mjs';
const id = '4e7047c8-e15f-4d27-979a-12500a5fc64b';
const { data: antes } = await svc.from('ticket_types').select('name, is_courtesy, is_active, price_cents, event_id').eq('id', id).single();
if (antes.event_id !== '4d0c3276-880e-4318-ae27-61793d1ec2c4' || antes.price_cents !== 0) throw new Error('no es la fila esperada');
const { error } = await svc.from('ticket_types').update({ is_courtesy: false }).eq('id', id);
const { data: despues } = await svc.from('ticket_types').select('name, is_courtesy, is_active').eq('id', id).single();
console.log('antes', antes, '→ después', despues, error?.message ?? 'ok');
