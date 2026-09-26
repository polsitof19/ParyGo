// "Marcar como agotada" desde el panel (2026-09-26), contra un server LOCAL y
// SOLO en demotest. Abre Entradas del último evento de demotest con la sesión
// real del organizador, toca el botón en el primer tipo, confirma, y verifica:
//   · en la base: capacidad = vendidas (+ reservadas en curso) y sin "ilimitado";
//   · en la pantalla: el botón se cambia por "Agotada: ya no se vende…".
// Después DEJA el tipo como estaba (capacidad e ilimitado originales).
//   node e2e/marcar-agotada.mjs
import { chromium } from 'playwright';
import { svc, BASE, log, otpSession, sessionCookies } from './lib.mjs';

const R = [];
const check = (n, ok, d = '') => { R.push(ok); log(`${ok ? '✔' : '✘'} ${n}${d ? ' — ' + d : ''}`); };

const { data: brand } = await svc.from('brands').select('id').eq('slug', 'demotest').single();
const { data: evs } = await svc.from('events').select('id, name').eq('brand_id', brand.id).order('created_at', { ascending: false }).limit(5);
let ev = null, tt = null;
for (const e of evs ?? []) {
  const { data: tts } = await svc.from('ticket_types').select('id, name, capacity, sold, is_unlimited').eq('event_id', e.id).order('sort_order').limit(1);
  if (tts?.[0]) { ev = e; tt = tts[0]; break; }
}
if (!tt) throw new Error('demotest no tiene un evento con tipos de entrada');
const antes = { capacity: tt.capacity, is_unlimited: tt.is_unlimited };
log(`evento "${ev.name}", tipo "${tt.name}" (capacidad ${tt.capacity}, vendidas ${tt.sold}, ilimitado ${tt.is_unlimited})`);

const s = await otpSession('brandadmin.demotest@parygo.test');
const b = await chromium.launch();
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies(sessionCookies(s, BASE));
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  await p.goto(`${BASE}/admin/events/${ev.id}/entradas`, { waitUntil: 'load' });
  const fold = p.locator('details.s-fold', { hasText: tt.name }).first();
  await fold.locator(':scope > summary').click();
  const boton = fold.getByRole('button', { name: 'Marcar como agotada' });
  check('el botón "Marcar como agotada" está en el tipo', await boton.count() === 1);
  await boton.click();
  await p.waitForResponse((r) => r.request().method() === 'POST', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const { data: despues } = await svc.from('ticket_types').select('capacity, sold, is_unlimited').eq('id', tt.id).single();
  check('en la base: capacidad = vendidas, sin ilimitado', despues.capacity === despues.sold && despues.is_unlimited === false, JSON.stringify(despues));
  const fila = await fold.locator(':scope > summary').innerText();
  check('en la pantalla: la fila dice agotada', /agotada/.test(fila), fila.replace(/\s+/g, ' '));
  await fold.locator(':scope > summary').click();
  check('abierta: dice cómo reabrirla', await fold.getByText(/Agotada: ya no se vende/).isVisible());
  const { count: logs } = await svc.from('events_log').select('id', { count: 'exact', head: true }).eq('event_id', ev.id).eq('type', 'ticket_type_edited').contains('payload', { ticket_type_id: tt.id, agotada: true });
  check('queda en el registro del evento (events_log)', (logs ?? 0) > 0, `${logs}`);

  // Dos pestañas marcan a la vez: las dos escriben lo mismo y la capacidad
  // nunca queda por debajo de lo vendido.
  await svc.from('ticket_types').update(antes).eq('id', tt.id);
  const pestañas = await Promise.all([ctx.newPage(), ctx.newPage()]);
  for (const q of pestañas) {
    q.on('dialog', (d) => d.accept());
    await q.goto(`${BASE}/admin/events/${ev.id}/entradas`, { waitUntil: 'load' });
    await q.locator('details.s-fold', { hasText: tt.name }).first().locator(':scope > summary').click();
  }
  await Promise.all(pestañas.map((q) => q.locator('details.s-fold', { hasText: tt.name }).first().getByRole('button', { name: 'Marcar como agotada' }).click()));
  await Promise.all(pestañas.map((q) => q.waitForResponse((r) => r.request().method() === 'POST', { timeout: 20000 }).catch(() => {})));
  await p.waitForTimeout(1500);
  const { data: doble } = await svc.from('ticket_types').select('capacity, sold, is_unlimited').eq('id', tt.id).single();
  check('dos a la vez: capacidad = vendidas (nunca menos)', doble.capacity === doble.sold && doble.capacity >= doble.sold, JSON.stringify(doble));
} catch (e) {
  check('excepción', false, e.message);
} finally {
  await b.close();
  await svc.from('ticket_types').update(antes).eq('id', tt.id);
  log(`tipo restaurado: ${JSON.stringify(antes)}`);
}
const ok = R.filter(Boolean).length;
log(`${ok === R.length ? '✅' : '❌'} ${ok}/${R.length}`);
process.exit(ok === R.length ? 0 : 1);
