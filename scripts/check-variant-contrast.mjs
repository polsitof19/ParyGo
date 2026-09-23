// Contraste de lo que PINTA la superficie del comprador (tema noche).
//
// Antes medía colores fijos de las dos "direcciones de arte" de la compra
// (clara y una noche CÁLIDA #14110E). Desde el 2026-09-23 el comprador va en
// negro neutro y los valores salen de los archivos reales:
//   · apps/web/app/styles/parygo-tokens.css  (.pg.pg-noche)
//   · apps/web/app/b/[brand]/client.css      (.c-pass__card: la entrada es
//     una tarjeta BLANCA con su propia tinta)
// Mide texto sobre cada superficie donde cae, con las alfas compuestas contra
// su fondo como las pinta el navegador. Además guarda dos reglas de diseño que
// ya rompieron el contraste antes: nada de fondos cálidos en el tema noche, y
// ningún opacity < 1 sobre una fila que lleva texto (lo "apagado" con
// opacity sacaba el texto secundario de AA).
//
// Corre dentro de `npm run test:contrast`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MIN = 4.5;
const aqui = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(aqui, '..', 'apps', 'web', 'app', 'styles', 'parygo-tokens.css'), 'utf8');
const client = readFileSync(join(aqui, '..', 'apps', 'web', 'app', 'b', '[brand]', 'client.css'), 'utf8');
const compra = readFileSync(join(aqui, '..', 'apps', 'web', 'app', 'b', '[brand]', 'compra.css'), 'utf8');

function bloque(css, selector) {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) throw new Error(`no está el bloque ${selector}`);
  const cuerpo = css.slice(i, css.indexOf('}', i));
  const out = {};
  for (const m of cuerpo.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
function parse(v) {
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return { c: [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)), a: 1 };
  m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(v);
  if (m) return { c: [+m[1], +m[2], +m[3]], a: +m[4] };
  throw new Error(`color no reconocido: ${v}`);
}
const lum = ([r, g, b]) => {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (fgv, bgv) => {
  const fg = parse(fgv); const bg = parse(bgv).c;
  const comp = fg.c.map((c, i) => c * fg.a + bg[i] * (1 - fg.a));
  const [x, y] = [lum(comp), lum(bg)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const noche = bloque(tokens, '.pg.pg-noche');
const pase = bloque(client, '.client-shell .c-pass__card');

const CASOS = [];
for (const t of ['ink', 'ink-2', 'ink-3']) for (const s of ['bg', 'surface', 'surface-2', 'selected']) {
  CASOS.push([`noche · --${t} sobre --${s}`, noche[t], noche[s], MIN]);
}
for (const t of ['ink', 'ink-2', 'ink-3']) CASOS.push([`entrada (tarjeta blanca) · --${t}`, pase[t], '#FFFFFF', MIN]);
CASOS.push(['noche · hairline --line sobre --bg (no porta texto)', noche.line, noche.bg, 1.3]);

console.log('\nSuperficie del comprador (tema noche) y la entrada\n');
let fallos = 0;
for (const [nombre, fg, bg, min] of CASOS) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fallos += 1;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre.padEnd(52)} ${r.toFixed(2)}:1  (mín ${min})`);
}

// Fondos neutros: ningún valor del tema noche puede tener tinte (r = g = b).
for (const k of ['bg', 'surface', 'surface-2', 'selected']) {
  const [r, g, b] = parse(noche[k]).c;
  if (!(r === g && g === b)) { fallos += 1; console.log(`FALLA --${k} (${noche[k]}) no es neutro: la regla es blanco o negro, nunca crema ni marrón.`); }
}

// Filas con texto: sin opacity de "apagado".
const filas = [...compra.matchAll(/\.b-ty(?:--out|--on)?\s*\{([^}]*)\}/g)].filter((m) => /opacity:\s*0?\.\d/.test(m[1]));
if (filas.length) { fallos += 1; console.log('FALLA una fila de entrada (.b-ty) se apaga con opacity: saca el texto secundario de AA.'); }

if (fallos > 0) {
  console.error(`\n${fallos} caso(s) no cumplen.`);
  process.exit(1);
}
console.log('\nOK — el texto del comprador cumple AA sobre todas sus superficies y la entrada blanca.');
