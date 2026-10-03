#!/usr/bin/env node
'use strict';
/**
 * Mide el contraste WCAG de los tokens de parygo-tokens.css que portan texto,
 * sobre las cuatro superficies de papel. Falla (exit 1) si alguno baja de AA.
 *
 * Qué mide:
 *   - --ink, --ink-2, --ink-3 (texto) sobre --paper, --paper-2, --paper-3, --surface  → ≥ 4.5
 *   - --ink sobre --accent (texto de botón primario)                                  → ≥ 4.5
 *   - --accent-deep sobre --paper (h1 de la landing, display ≥56px)                   → ≥ 3.0
 *   - TEMA NOCHE (.pg.pg-noche, comprador): --ink, --ink-2, --ink-3 sobre
 *     --bg, --surface, --surface-2, --selected                                         → ≥ 4.5
 * Qué NO mide: --accent/--peri/--ok/--warn/--alert como texto — la regla dura
 * del archivo prohíbe usarlos para texto; acá solo se informa su valor.
 *
 * Correr con: npm run test:contrast
 */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'apps/web/app/styles/parygo-tokens.css'), 'utf8');
// Cada bloque por separado: el tema noche redefine --ink y --paper, y un
// parser plano del archivo entero se quedaba con los valores de noche para
// medir el papel.
function bloque(selector) {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) throw new Error(`no está el bloque ${selector}`);
  const cuerpo = css.slice(i, css.indexOf('}', i));
  const out = {};
  for (const m of cuerpo.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const tok = bloque('\n.pg');
const noche = bloque('.pg.pg-noche');

function parse(v) {
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(v);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
  throw new Error(`color no reconocido: ${v}`);
}
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
const ratio = (fg, bg) => { const c = over(fg, bg); const a = L(c), b = L(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };

const papers = ['paper', 'paper-2', 'paper-3', 'surface'];
let fail = false;
const row = (label, r, min) => { const ok = r >= min; if (!ok) fail = true; console.log(`${ok ? 'OK  ' : 'FAIL'} ${label.padEnd(34)} ${r.toFixed(2).padStart(6)}:1  (mín ${min})`); };

for (const t of ['ink', 'ink-2', 'ink-3']) for (const p of papers) row(`--${t} sobre --${p}`, ratio(parse(tok[t]), parse(tok[p])), 4.5);
row('--ink sobre --accent (botón)', ratio(parse(tok.ink), parse(tok.accent)), 4.5);
row('--ink sobre --accent-deep (hover)', ratio(parse(tok.ink), parse(tok['accent-deep'])), 4.5);
row('--accent-deep sobre --paper (h1 ≥56px)', ratio(parse(tok['accent-deep']), parse(tok.paper)), 3.0);
// Tema noche: el texto del comprador sobre las cuatro superficies neutras.
// El peor caso es --selected (#202020), la fila elegida.
console.log('\nTema noche (superficies del comprador):');
for (const t of ['ink', 'ink-2', 'ink-3']) for (const p of ['bg', 'surface', 'surface-2', 'selected']) row(`noche --${t} sobre --${p}`, ratio(parse(noche[t]), parse(noche[p])), 4.5);
console.log(`     noche --line sobre --bg ${ratio(parse(noche.line), parse(noche.bg)).toFixed(2)}:1 (hairline decorativo, informativo)`);
console.log('\nInformativo (PROHIBIDOS como texto por la regla dura):');
for (const t of ['accent', 'peri', 'ok', 'warn', 'alert']) console.log(`     --${t.padEnd(8)} sobre --paper   ${ratio(parse(tok[t]), parse(tok.paper)).toFixed(2)}:1 · blanco encima ${ratio({ r: 255, g: 255, b: 255, a: 1 }, parse(tok[t])).toFixed(2)}:1`);
process.exit(fail ? 1 : 0);
