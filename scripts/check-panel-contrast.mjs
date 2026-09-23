#!/usr/bin/env node
// Mide el contraste del TEMA CLARO de los paneles (parygo-panel.css, bloque
// "@media (prefers-color-scheme: light)"). El oscuro son los tokens de
// .pg.pg-noche, que ya mide check-tokens-contrast.js. Falla (exit 1) si algo
// que porta texto baja de AA 4.5:1, o si el fondo claro deja de ser neutro.
//
// Correr con: npm run test:contrast
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(ROOT, 'apps/web/app/styles/parygo-panel.css'), 'utf8');
const i = css.indexOf('@media (prefers-color-scheme: light) {\n  .pg.pg-panel {');
if (i < 0) throw new Error('no está el bloque del tema claro de los paneles');
const cuerpo = css.slice(i, css.indexOf('}', i));
const tok = {};
for (const m of cuerpo.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) tok[m[1]] = m[2].trim();

const hex = (v) => {
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) throw new Error(`color no reconocido: ${v}`);
  return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
};
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const x = L(hex(a)), y = L(hex(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

let fail = false;
const row = (label, r, min) => { const ok = r >= min; if (!ok) fail = true; console.log(`${ok ? 'OK  ' : 'FAIL'} ${label.padEnd(40)} ${r.toFixed(2).padStart(6)}:1  (mín ${min})`); };

console.log('Tema claro de los paneles:');
for (const t of ['ink', 'ink-2', 'ink-3']) for (const s of ['bg', 'surface', 'surface-2', 'selected']) row(`claro --${t} sobre --${s}`, ratio(tok[t], tok[s]), 4.5);
row('claro primario: --on-white sobre --ink', ratio(tok['on-white'], tok.ink), 4.5);
row('claro primario hover: --on-white sobre --white-hover', ratio(tok['on-white'], tok['white-hover']), 4.5);

// Neutro: sin tinte cálido (regla de fondos del comprador, extendida a los paneles).
for (const s of ['bg', 'surface', 'surface-2', 'selected']) {
  const [r, g, b] = hex(tok[s]);
  const neutro = Math.max(r, g, b) - Math.min(r, g, b) <= 4;
  if (!neutro) fail = true;
  console.log(`${neutro ? 'OK  ' : 'FAIL'} claro --${s} ${tok[s]} es neutro`);
}
process.exit(fail ? 1 : 0);
