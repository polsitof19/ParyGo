// Tiempo de respuesta del server por pantalla del panel (sesión real del
// organizador de demotest; segunda vuelta, en caliente). Solo lecturas.
//   E2E_BASE=https://app.parygo.com node e2e/panel-velocidad.mjs
import { svc, otpSession, sessionCookies } from './lib.mjs';
const BASE = process.env.E2E_BASE || 'https://app.parygo.com';
const s = await otpSession('brandadmin.demotest@parygo.test');
const cookie = sessionCookies(s, BASE).map((c) => `${c.name}=${c.value}`).join('; ');
const { data: b } = await svc.from('brands').select('id').eq('slug', 'demotest').single();
const { data: ev } = await svc.from('events').select('id').eq('brand_id', b.id).order('created_at', { ascending: false }).limit(1);
const e = ev?.[0]?.id;
const rutas = ['/admin', `/admin/events/${e}`, `/admin/events/${e}/estadisticas`, `/admin/events/${e}/entradas`, `/admin/events/${e}/yape`, `/admin/events/${e}/cortesias`, `/admin/events/${e}/clientes`, `/admin/events/${e}/promotores`, `/admin/events/${e}/accesos`, `/admin/events/${e}/editar`, '/admin/settings', '/admin/equipo', '/admin/comprar', '/scan'];
for (let vuelta = 0; vuelta < 2; vuelta++) for (const r of rutas) {
  const t0 = performance.now();
  const res = await fetch(BASE + r, { headers: { cookie }, redirect: 'manual' });
  const body = await res.text();
  if (vuelta) console.log(String(Math.round(performance.now() - t0)).padStart(5) + 'ms', res.status, (body.length / 1024).toFixed(0) + 'KB', r.replace(e, '<ev>'));
}
