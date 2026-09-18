// Limpieza post-E2E. SOLO toca la marca demotest (guard por brand_id en cada write).
// - Órdenes E2E que quedaron en revisión → failed + libera sus reservas de stock
//   (si no, inflan "Yape por revisar" en la cabina y retienen cupo).
// - Archiva los eventos e2e-* (dejan de verse en demotest.parygo.com).
// - Re-archiva la marca demotest (estado original: archivada).
// Uso: node e2e/cleanup.mjs   (E2E_KEEP_BRAND=1 para dejar la marca desarchivada)
import { svc, BRAND } from './lib.mjs';

const { data: b } = await svc.from('brands').select('id, slug').eq('slug', BRAND).single();
if (!b || b.slug !== 'demotest') throw new Error('solo demotest');

const { data: pend } = await svc.from('orders').select('id, buyer_email, status')
  .eq('brand_id', b.id).eq('status', 'pending_yape_review').like('buyer_email', 'e2e-%@test.local');
for (const o of pend ?? []) {
  await svc.from('orders').update({ status: 'failed' }).eq('id', o.id).eq('brand_id', b.id);
  await svc.rpc('release_stock_reservations_for_order', { p_order_id: o.id });
}
console.log('órdenes E2E pendientes → failed:', (pend ?? []).length);

const now = new Date().toISOString();
const { data: evs } = await svc.from('events').update({ archived_at: now })
  .eq('brand_id', b.id).like('slug', 'e2e-%').is('archived_at', null).select('slug');
console.log('eventos e2e archivados:', (evs ?? []).map((e) => e.slug).join(' ') || '(ninguno)');

if (!process.env.E2E_KEEP_BRAND) {
  await svc.from('brands').update({ archived_at: now }).eq('id', b.id);
  await svc.from('events_log').insert({ brand_id: b.id, type: 'brand_archived', payload: { by: 'e2e-cleanup' } });
  console.log('demotest re-archivada');
}
