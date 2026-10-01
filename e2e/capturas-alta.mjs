// Capturas del alta (/empezar) a 390 y 1440: paso del código, paso de la
// contraseña con la regla en vivo y, en 390, el botón fijo abajo. Mide
// desbordes (scroll horizontal, elementos fuera de pantalla, texto cortado).
// Crea (y borra al final) un usuario de prueba por viewport; NO crea marcas.
//   node e2e/capturas-alta.mjs      -> tmp/capturas-alta/
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { svc, BASE, log } from './lib.mjs';

const OUT = 'tmp/capturas-alta';
mkdirSync(OUT, { recursive: true });
const STAMP = Date.now().toString().slice(-7);
const usuarios = [];
const R = [];
const check = (n, ok, d = '') => { R.push(ok); log(`${ok ? '✔' : '✘'} ${n}${d ? ' — ' + d : ''}`); };

// Desbordes: scroll horizontal, cajas que se salen del ancho, texto cortado.
const medir = (p) => p.evaluate(() => {
  const W = document.documentElement.clientWidth;
  const fuera = [], cortados = [];
  for (const e of document.querySelectorAll('main *, header *')) {
    if (e.closest('.ez-hp')) continue;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed' && false) continue;
    if (r.right > W + 1 || r.left < -1) fuera.push(`${e.tagName}.${String(e.className).split(' ')[0]} ${Math.round(r.left)}..${Math.round(r.right)}`);
    if (e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && /hidden|clip|ellipsis/.test(cs.overflowX + cs.textOverflow)) cortados.push(`${e.tagName}.${String(e.className).split(' ')[0]} "${(e.textContent || '').slice(0, 30)}"`);
  }
  return { scrollX: document.documentElement.scrollWidth - W, fuera: fuera.slice(0, 6), cortados: cortados.slice(0, 6) };
});

const b = await chromium.launch();
try {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const email = `delivered+alta-cap${w}${STAMP}@resend.dev`;
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/empezar?tipo=marca`, { waitUntil: 'networkidle' });
    const sig = () => p.getByRole('button', { name: /^Continuar/ }).click();
    await p.locator('.ez-plan:has(input[value="prueba"])').click();
    await sig();
    await p.fill('#ez-nombre', 'Noches Del Sur');
    await sig();
    await p.locator('#e-slug').filter({ hasText: /Disponible|ya pertenece/ }).waitFor({ timeout: 10000 }).catch(() => {});
    await sig();
    await p.fill('#ez-email', email);
    await p.fill('#ez-wa', `9${w === 390 ? '8' : '9'}${STAMP}`);
    await sig();
    await p.locator('#ez-codigo').waitFor({ timeout: 15000 });
    const { data: u } = await svc.rpc('usuario_id_por_email', { p_email: email });
    if (u) usuarios.push(u);
    await p.fill('#ez-codigo', '1234');
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/${w}-1-codigo.png`, fullPage: true });
    let m = await medir(p);
    check(`${w} código: sin desborde`, m.scrollX <= 0 && !m.fuera.length && !m.cortados.length, JSON.stringify(m));
    if (w === 390) {
      const bb = await p.getByRole('button', { name: /^Continuar/ }).boundingBox();
      check('390 código: el botón se ve sin bajar', !!bb && bb.y >= 0 && bb.y + bb.height <= h, bb ? `y=${Math.round(bb.y)} fin=${Math.round(bb.y + bb.height)} de ${h}` : 'sin botón');
      await p.screenshot({ path: `${OUT}/${w}-1-codigo-pantalla.png` });
    }

    const { data } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
    await p.fill('#ez-codigo', data.properties.email_otp);
    await sig();
    await p.locator('#ez-pass').waitFor({ timeout: 15000 }).catch(() => {});
    if (!(await p.locator('#ez-pass').count())) { check(`${w} contraseña: se llega desde el código`, false, 'la pantalla se reinició'); await ctx.close(); continue; }
    await p.fill('#ez-pass', 'abcdefgh1');
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/${w}-2-contrasena.png`, fullPage: true });
    m = await medir(p);
    check(`${w} contraseña: sin desborde`, m.scrollX <= 0 && !m.fuera.length && !m.cortados.length, JSON.stringify(m));
    check(`${w} contraseña: la regla marca 3 de 4 (falta la mayúscula)`, (await p.locator('.ez-reglas li.is-ok').count()) === 3);
    if (w === 390) {
      const bb = await p.getByRole('button', { name: /^(Crear mi prueba|Pagar)/ }).boundingBox();
      check('390 contraseña: el botón está fijo abajo y visible', !!bb && bb.y >= 0 && bb.y + bb.height <= h && bb.y > h - 140, bb ? `y=${Math.round(bb.y)} fin=${Math.round(bb.y + bb.height)} de ${h}` : 'sin botón');
      await p.screenshot({ path: `${OUT}/${w}-2-contrasena-pantalla.png` });
      await p.fill('#ez-pass', 'Abcdefgh1');
      await p.waitForTimeout(300);
      await p.screenshot({ path: `${OUT}/${w}-3-contrasena-ok-pantalla.png` });
    }
    await ctx.close();
  }
} finally {
  await b.close();
  for (const u of usuarios) await svc.auth.admin.deleteUser(u);
  for (const pre of ['alta', 'verif']) await svc.from('ticket_resend_attempts').delete().like('email', `${pre}:delivered+alta-cap%@resend.dev`);
}
log(`${R.every(Boolean) ? '✅' : '❌'} ${R.filter(Boolean).length}/${R.length}`);
