//   node e2e/smoke-prod-super.mjs   (después de un deploy a refactor/monorepo)
//
// Smoke en PRODUCCIÓN del modo edición del super admin. Solo toca demotest:
// enciende y apaga el modo edición (dos filas de bitácora), no edita nada.
import { chromium } from 'playwright';
import { svc, otpSession, sessionCookies } from './lib.mjs';
import { SUPER, DEMOTEST } from './vistas-paneles.mjs';
import { query } from '../supabase/mgmt.mjs';
const BASE = 'https://app.parygo.com';
const ok = []; const check = (n, c, d = '') => { ok.push(c); console.log(`${c ? '✔' : '✘'} ${n}${d ? ' — ' + String(d).slice(0, 140) : ''}`); };
const sess = await otpSession(SUPER);
const b = await chromium.launch(); const ctx = await b.newContext();
await ctx.addCookies([...sessionCookies(sess, BASE),
  { name: 'parygo_imp', value: DEMOTEST, domain: 'app.parygo.com', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
const p = await ctx.newPage();
let listo = false;
for (let i = 0; i < 40 && !listo; i++) {
  await p.goto(`${BASE}/admin?s=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  listo = await p.getByRole('button', { name: /Editar como super admin/i }).count() > 0;
  if (!listo) { console.log(`… deploy todavía no está (${i + 1})`); await p.waitForTimeout(20000); }
}
check('deploy nuevo en app.parygo.com (aparece el interruptor)', listo);
if (listo) {
  // La hora de la BASE, no la de esta máquina: el reloj local puede ir
  // segundos adelantado y dejar afuera la fila del encendido.
  const [{ now: t0 }] = await query('select now()');
  check('al entrar a la marca: SOLO LECTURA', /SOLO LECTURA/i.test(await p.locator('.imp-banner').innerText()));
  await p.getByRole('button', { name: /Editar como super admin/i }).click();
  await p.locator('.imp-banner--edit').waitFor({ timeout: 30000 }).catch(() => {});
  check('modo edición encendido: franja EDITANDO', /EDITANDO/i.test(await p.locator('.imp-banner').innerText()));
  const ck = (await ctx.cookies()).find((c) => c.name === 'parygo_imp_edit');
  check('la cookie de edición queda atada a la marca', ck?.value === DEMOTEST && ck.httpOnly && ck.secure, ck?.value);
  await p.getByRole('button', { name: /Salir del modo edición/i }).click();
  await p.locator('.imp-banner:not(.imp-banner--edit)').waitFor({ timeout: 30000 }).catch(() => {});
  check('modo edición apagado: vuelve a SOLO LECTURA', /SOLO LECTURA/i.test(await p.locator('.imp-banner').innerText()));
  const { data: log } = await svc.from('events_log').select('type').eq('brand_id', DEMOTEST).gte('created_at', t0).in('type', ['super_edit_mode_on', 'super_edit_mode_off']);
  check('encender y apagar quedaron en la bitácora', (log ?? []).length === 2, JSON.stringify(log));
  await p.getByRole('button', { name: /Salir de la marca/i }).click();
  await p.waitForURL(/cabina-7k29x/, { timeout: 30000 }).catch(() => {});
  const r = await p.goto(`${BASE}/cabina-7k29x/salud`, { waitUntil: 'domcontentloaded' });
  const txt = (await p.innerText('body')).replace(/\s+/g, ' ');
  check('cabina /salud carga con "Acciones de super admin"', r.status() === 200 && /Acciones de super admin/i.test(txt), r.status());
}
for (const u of ['https://parygo.com/', 'https://code.parygo.com/standly-en-cocos', 'https://hoesky.parygo.com/']) {
  const r = await fetch(u); check(`público ${u} → 200`, r.status === 200, r.status);
}
await b.close();
console.log(ok.every(Boolean) ? 'SMOKE VERDE' : 'SMOKE CON FALLAS'); process.exit(ok.every(Boolean) ? 0 : 1);
