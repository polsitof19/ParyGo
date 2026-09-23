// AUDITORIA DE IPHONE de los paneles. WebKit real (el motor de Safari) a los
// dos anchos que importan: 390x844 (iPhone 13..16) y 430x932 (Pro Max).
//
// Mide, no opina: overflow horizontal del documento, elementos que se salen,
// texto recortado sin ellipsis, areas de toque por debajo de 44px, botones
// montados, numeros de stat que no caben, y alturas atadas a 100vh (que en
// Safari movil NO es lo visible: la barra de direcciones se come una franja).
//
// La safe-area se emula con --pg-safe-* inyectado, porque env() en WebKit
// headless siempre da 0. Ver NOTA-safe-area en el informe.
//
// node e2e/audit-iphone.mjs [--panel super|admin|puerta|compra|all] [--shot pref]
//                           [--only sub] [--w 390,430] [--motor chromium]
//
// CLS: WebKit NO implementa la API de Layout Instability, así que en WebKit
// el CLS sale null. Con --motor chromium la misma pasada (viewport, UA y
// toque del iPhone) mide el CLS acumulado de la carga (layout-shift sin
// input reciente), que es lo que pide el gate del comprador (< 0.1).
import { webkit, chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { otpSession, sessionCookies, BASE, log } from './lib.mjs';
import { vistas, SUPER, ADMIN, VALIDATOR } from './vistas-paneles.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'tmp', 'iphone');
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const PANEL = flag('--panel', 'all');
const SHOT = flag('--shot', null);
const ONLY = flag('--only', null);
const ANCHOS = flag('--w', '390,430').split(',').map(Number);
const MOTOR = flag('--motor', 'webkit') === 'chromium' ? chromium : webkit;
if (SHOT) mkdirSync(resolve(OUT, 'shots'), { recursive: true });

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ALTOS = { 390: 844, 430: 932 };

// Safe-area de un iPhone con notch/isla, en puntos CSS. env() no existe en
// headless, asi que se inyecta como variable y se comprueba que nada la ignore.
const SAFE = { top: 59, bottom: 34, left: 0, right: 0 };

const MEDIR = () => {
  const de = document.documentElement;
  const W = de.clientWidth;
  const out = { W, scrollW: Math.round(de.scrollWidth), scrollH: Math.round(de.scrollHeight), vh: window.innerHeight };

  const path = (e) => {
    const bits = [];
    for (let n = e; n && n.nodeType === 1 && bits.length < 4; n = n.parentElement) {
      const cls =
        typeof n.className === 'string' && n.className.trim()
          ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';
      bits.unshift(n.tagName.toLowerCase() + cls);
    }
    return bits.join(' > ');
  };
  const txt = (e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const vis = (e) => {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    // WebKit le da caja a lo que vive dentro de un <details> CERRADO (el
    // acordeón de "Zona de gestión", el de eventos archivados). No se ve y no
    // se puede tocar: contarlo daba solapamientos y targets fantasma.
    if (e.closest('details:not([open])') && !e.closest('summary')) return false;
    // Oculto a la vista pero presente para lectores (la cabecera de una tabla
    // que en el teléfono se vuelve lista).
    if (cs.clipPath && cs.clipPath !== 'none') return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const all = [...document.querySelectorAll('body *')].filter(vis);

  const fuera = [];
  for (const e of all) {
    const r = e.getBoundingClientRect();
    if (r.right <= W + 1 && r.left >= -1) continue;
    const p = e.parentElement;
    if (p && p !== document.body) {
      const pr = p.getBoundingClientRect();
      if (pr.right > W + 1 || pr.left < -1) continue;
      if (/auto|scroll|hidden/.test(getComputedStyle(p).overflowX)) continue;
    }
    fuera.push({ q: path(e), t: txt(e), left: Math.round(r.left), right: Math.round(r.right), exceso: Math.round(r.right - W) });
  }

  const desliza = [];
  for (const e of all) {
    if (!/auto|scroll/.test(getComputedStyle(e).overflowX)) continue;
    if (e.scrollWidth <= e.clientWidth + 2) continue;
    desliza.push({ q: path(e), sw: e.scrollWidth, cw: e.clientWidth, sobra: e.scrollWidth - e.clientWidth });
  }

  const cortado = [];
  for (const e of all) {
    const cs = getComputedStyle(e);
    if (!/hidden|clip/.test(cs.overflowX)) continue;
    if (cs.textOverflow === 'ellipsis') continue;
    if (e.scrollWidth <= e.clientWidth + 1) continue;
    if (!txt(e)) continue;
    if (e.querySelector('img, svg, canvas')) continue;
    cortado.push({ q: path(e), t: txt(e), sw: e.scrollWidth, cw: e.clientWidth });
  }

  const SEL =
    'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [tabindex]:not([tabindex="-1"])';
  const toque = [];
  const cajas = [];
  for (const e of document.querySelectorAll(SEL)) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    let top = r.top, bottom = r.bottom, left = r.left, right = r.right;
    for (const ps of ['::after', '::before']) {
      const cs = getComputedStyle(e, ps);
      if (cs.content === 'none' || cs.position !== 'absolute') continue;
      const h = parseFloat(cs.height) || 0;
      if (h > r.height) { const g = (h - r.height) / 2; top -= g; bottom += g; }
    }
    // Una casilla o un radio dibujan 16-18px, pero lo que se toca es su
    // <label>: tocar la palabra marca la casilla. Se mide la etiqueta.
    const lb = (e.tagName === 'INPUT' && /^(checkbox|radio)$/.test(e.type))
      ? (e.closest('label') || (e.id ? document.querySelector(`label[for="${e.id}"]`) : null))
      : null;
    if (lb) {
      const rl = lb.getBoundingClientRect();
      top = Math.min(top, rl.top); bottom = Math.max(bottom, rl.bottom);
      left = Math.min(left, rl.left); right = Math.max(right, rl.right);
    }
    const w = right - left, h = bottom - top;
    if (Math.min(w, h) < 43.5) toque.push({ q: path(e), t: txt(e) || (lb ? txt(lb) : ''), w: Math.round(w), h: Math.round(h) });
    cajas.push({ e, q: path(e), t: txt(e), top, bottom, left, right, dentroDeCampo: getComputedStyle(e).position === 'absolute' });
  }

  const montados = [];
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      const a = cajas[i], b = cajas[j];
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      // Un control puesto ADENTRO de su campo (el ojo de la contraseña) se
      // monta sobre el campo a propósito: está encima, así que el toque va al
      // botón, y el texto del campo no llega hasta ahí (padding-right).
      // Cuenta como intencional solo si comparten el mismo contenedor posicionado.
      const unoAdentro =
        (a.dentroDeCampo && a.e.offsetParent && a.e.offsetParent.contains(b.e)) ||
        (b.dentroDeCampo && b.e.offsetParent && b.e.offsetParent.contains(a.e));
      if (unoAdentro) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > 2)
        montados.push({ a: a.q + ' «' + a.t + '»', b: b.q + ' «' + b.t + '»', ox: Math.round(ox), oy: Math.round(oy) });
    }
  }

  const stats = [];
  for (const e of document.querySelectorAll(
    '.s-stat__value, .a-money__v, .s-bignum, .a-yrow__amt, .s-saldo-num, .a-code, .s-stat__label, .a-evcard__name'
  )) {
    if (!vis(e)) continue;
    if (e.scrollWidth > e.clientWidth + 1) stats.push({ q: path(e), t: txt(e), sw: e.scrollWidth, cw: e.clientWidth });
  }

  const shellEl = document.querySelector('.pg-panel, .scan-shell, .client-shell, .login-shell');
  const shell = shellEl
    ? { q: shellEl.className.split(/\s+/).slice(0, 3).join('.'), minHeight: getComputedStyle(shellEl).minHeight, innerHeight: window.innerHeight }
    : null;

  // Bandas vacias entre dos hairlines: un bloque con borde arriba y abajo y
  // sin contenido visible. Es lo que se ve como "caja vacia".
  const vacios = [];
  for (const e of all) {
    const r = e.getBoundingClientRect();
    if (r.height > 60 || r.height < 4) continue;
    const cs = getComputedStyle(e);
    const conLinea = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0;
    if (!conLinea) continue;
    if (txt(e) || e.querySelector('img, svg, input, button, a')) continue;
    vacios.push({ q: path(e), h: Math.round(r.height) });
  }

  const cls = typeof window.__cls === 'number' ? Math.round(window.__cls * 1000) / 1000 : null;
  return { ...out, fuera, desliza, cortado, toque, montados, stats, shell, vacios, cls };
};

const V = (await vistas(PANEL)).filter((v) => !ONLY || v.id.includes(ONLY));
const sesiones = {};
for (const email of [
  ...new Set(V.map((v) => v.sesion).filter((s) => s !== 'anon')),
].map((s) => ({ super: SUPER, admin: ADMIN, validator: VALIDATOR }[s]))) {
  // nada: se resuelve abajo con el nombre del rol
  void email;
}
for (const rol of new Set(V.map((v) => v.sesion))) {
  if (rol === 'anon') continue;
  const email = { super: SUPER, admin: ADMIN, validator: VALIDATOR }[rol];
  sesiones[rol] = await otpSession(email);
  log('sesion ' + rol + ' lista (' + email + ')');
}

const browser = await MOTOR.launch();
const informe = [];
for (const w of ANCHOS) {
  for (const rol of new Set(V.map((v) => v.sesion))) {
    const lote = V.filter((v) => v.sesion === rol);
    const ctx = await browser.newContext({
      viewport: { width: w, height: ALTOS[w] ?? 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: IPHONE_UA,
    });
    if (rol !== 'anon') await ctx.addCookies(sessionCookies(sesiones[rol], BASE));
    // Emulacion de safe-area: env() da 0 en headless, asi que se inyecta como
    // padding del root para verificar que nada se rompe con la isla y la barra.
    // CLS acumulado de la carga (donde el motor lo soporte).
    await ctx.addInitScript(() => {
      try {
        window.__cls = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
          .observe({ type: 'layout-shift', buffered: true });
      } catch { window.__cls = undefined; }
    });
    await ctx.addInitScript(
      ({ s }) => {
        const st = document.createElement('style');
        st.textContent = `:root{--pg-safe-top:${s.top}px;--pg-safe-bottom:${s.bottom}px}`;
        document.documentElement.appendChild(st);
      },
      { s: SAFE }
    );
    const page = await ctx.newPage();
    for (const v of lote) {
      const resp = await page.goto(BASE + v.url, { waitUntil: 'networkidle' }).catch(() => null);
      await page.waitForTimeout(700);
      const m = await page.evaluate(MEDIR);
      const st = m.scrollW > m.W + 1 ? 'OVERFLOW+' + (m.scrollW - m.W) : 'ok';
      log(
        w + ' ' + v.id.padEnd(20) + ' ' + String(resp?.status() ?? '?').padEnd(4) +
        String(m.scrollW).padStart(4) + '/' + m.W + ' ' + st.padEnd(12) +
        ' fuera:' + m.fuera.length + ' desliza:' + m.desliza.length + ' cortado:' + m.cortado.length +
        ' toque:' + m.toque.length + ' montados:' + m.montados.length + ' stats:' + m.stats.length +
        ' vacios:' + m.vacios.length + (m.cls !== null ? ' cls:' + m.cls : '')
      );
      informe.push({ w, status: resp?.status() ?? null, ...v, ...m });
      if (SHOT) await page.screenshot({ path: resolve(OUT, 'shots', SHOT + '-' + v.id + '-' + w + '.png'), fullPage: true });
    }
    await ctx.close();
  }
}
await browser.close();
const file = resolve(OUT, 'audit' + (SHOT ? '-' + SHOT : '') + '.json');
writeFileSync(file, JSON.stringify(informe, null, 2));
log('informe: ' + file);
