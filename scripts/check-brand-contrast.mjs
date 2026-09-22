// Contraste del COLOR DE MARCA en el sitio del comprador.
//
// La regla dura del sistema: --brand nunca porta texto "a ojo", porque el
// promotor elige cualquier color. Hay exactamente DOS funciones que lo
// permiten, y este test verifica las dos contra la misma tabla de colores:
//
//   brandFillPair()  texto SOBRE el color (botón primario, banda del ticket).
//   brandInk()       el color COMO texto sobre el papel (links del comprador).
//
// brandInk se medía contra BLANCO con un umbral de 2.8:1 y devolvía el color
// crudo: el propio tangerina salía a 2.30:1 sobre paper-3. Ahora el piso es
// AA 4.5:1 contra paper-3 (la superficie más oscura, el peor caso) y este test
// es lo que impide que vuelva a aflojarse.
//
// ⚠ La matemática está DUPLICADA a propósito, igual que parygo-tokens.css:
//   fuente real  → apps/web/lib/brandColors.ts  (brandFillPair)
//   copia de CI  → este archivo
// El CI corre en Node 20 (.nvmrc) y SIN npm install, así que no puede importar
// un .ts ni depender de tsx. Si tocás brandFillPair, tocá esta copia: el test
// de abajo compara las dos implementaciones línea por línea de comportamiento
// (mismo relleno y mismo texto para cada color de la tabla).
//
// Corre con `npm run test:contrast`, después del test de tokens fijos.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MIN = 4.5;
const INK = [0x23, 0x1c, 0x17];
const PAPER = [0xfb, 0xf7, 0xf0];
const PAPER_3 = [0xef, 0xe6, 0xd6];
const INK_HEX = '#231C17';
const PAPER_HEX = '#FBF7F0';

function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relLuminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastBetween(a, b) {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
function toHex([r, g, b]) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
function mix(rgb, target, m) {
  return [rgb[0] + (target[0] - rgb[0]) * m, rgb[1] + (target[1] - rgb[1]) * m, rgb[2] + (target[2] - rgb[2]) * m];
}
// Copia de brandFillPair (apps/web/lib/brandColors.ts).
function brandFillPair(hex) {
  const rgb = hex ? parseHex(hex) : null;
  if (!rgb) return { fill: '#FF6A3D', on: INK_HEX };
  const onInk = contrastBetween(rgb, INK);
  const onPaper = contrastBetween(rgb, PAPER);
  if (onInk >= 4.5) return { fill: toHex(rgb), on: INK_HEX };
  if (onPaper >= 4.5) return { fill: toHex(rgb), on: PAPER_HEX };
  const hacia = onInk >= onPaper ? PAPER : INK;
  const texto = onInk >= onPaper ? INK : PAPER;
  const textoHex = onInk >= onPaper ? INK_HEX : PAPER_HEX;
  for (let m = 0.04; m <= 1.001; m += 0.04) {
    const mezcla = mix(rgb, hacia, m);
    if (contrastBetween(mezcla, texto) >= 4.5) return { fill: toHex(mezcla), on: textoHex };
  }
  return { fill: toHex(hacia), on: textoHex };
}

// Copia de brandInk (apps/web/lib/brandColors.ts).
function brandInk(hex) {
  const rgb = hex ? parseHex(hex) : null;
  if (!rgb) return INK_HEX;
  if (contrastBetween(rgb, PAPER_3) >= 4.5) return toHex(rgb);
  for (let f = 0.995; f >= 0; f -= 0.005) {
    const candidato = toHex([rgb[0] * f, rgb[1] * f, rgb[2] * f]);
    if (contrastBetween(parseHex(candidato), PAPER_3) >= 4.5) return candidato;
  }
  return INK_HEX;
}

// Copia de brandFillHover (apps/web/lib/brandColors.ts).
function brandFillHover(hex) {
  const { fill, on } = brandFillPair(hex);
  const rgb = parseHex(fill);
  const texto = on === INK_HEX ? INK : PAPER;
  for (let m = 0.12; m >= 0.02; m -= 0.02) {
    const candidato = toHex(mix(rgb, texto, m));
    if (contrastBetween(parseHex(candidato), texto) >= 4.5) return candidato;
  }
  const lejos = on === INK_HEX ? [255, 255, 255] : [0, 0, 0];
  return toHex(mix(rgb, lejos, 0.12));
}

const MARCAS = [
  ['parygo (default)', '#FF6A3D'],
  ['hoesky', '#c2fbff'],
  ['hoesky (cyan puro)', '#00E5FF'],
  ['demotest', '#CC422A'],
  ['rosa', '#FF1F8F'],
  ['amarillo', '#F5D90A'],
  ['rojo medio', '#D7472F'],
  ['verde medio', '#2E9E6B'],
  ['azul marino', '#1A1A2E'],
  ['morado', '#742284'],
  ['negro', '#000000'],
  ['blanco', '#FFFFFF'],
  ['gris medio', '#808080'],
  ['hex inválido', 'no-es-un-color'],
];

let fallos = 0;
console.log('Par relleno/texto del color de marca (mínimo AA 4.5:1)\n');
for (const [nombre, color] of MARCAS) {
  const { fill, on } = brandFillPair(color);
  const r = contrastBetween(parseHex(fill), parseHex(on));
  const ok = r >= MIN;
  if (!ok) fallos += 1;
  const movido = parseHex(color) && fill.toLowerCase() !== color.toLowerCase();
  console.log(
    `${ok ? 'OK  ' : 'FALLA'} ${nombre.padEnd(20)} ${color.padEnd(14)} →  relleno ${fill} · texto ${on}  ${r.toFixed(2)}:1${movido ? '  (relleno corrido para que se lea)' : ''}`,
  );
}

// brandInk: el color de marca COMO texto sobre papel. Se mide contra paper-3,
// la más oscura de las cuatro superficies —si pasa ahí, pasa en las cuatro—.
console.log('\nColor de marca como TEXTO sobre papel, brandInk (mínimo AA 4.5:1 contra paper-3)\n');
for (const [nombre, color] of MARCAS) {
  const tinta = brandInk(color);
  const r = contrastBetween(parseHex(tinta), PAPER_3);
  const ok = r >= MIN;
  if (!ok) fallos += 1;
  const movido = parseHex(color) && tinta.toLowerCase() !== color.toLowerCase();
  console.log(
    `${ok ? 'OK  ' : 'FALLA'} ${nombre.padEnd(20)} ${color.padEnd(14)} →  tinta ${tinta}  ${r.toFixed(2)}:1${movido ? '  (oscurecido para que se lea)' : ''}`,
  );
}

// brandFillHover: el hover del relleno. Tiene que seguir llevando su texto a
// 4.5:1 Y verse distinto del reposo — un hover que no se nota no es un hover.
console.log(`\nHover del relleno de marca, brandFillHover (AA 4.5:1 con el MISMO texto, y distinto del reposo)\n`);
for (const [nombre, color] of MARCAS) {
  const { fill, on } = brandFillPair(color);
  const hover = brandFillHover(color);
  const r = contrastBetween(parseHex(hover), parseHex(on));
  const distinto = hover.toLowerCase() !== fill.toLowerCase();
  const ok = r >= MIN && distinto;
  if (!ok) fallos += 1;
  console.log(
    `${ok ? 'OK  ' : 'FALLA'} ${nombre.padEnd(20)} ${color.padEnd(14)} →  reposo ${fill} · hover ${hover} · texto ${on}  ${r.toFixed(2)}:1${distinto ? '' : '  (NO CAMBIA)'}`,
  );
}

// Las copias de arriba tienen que seguir siendo las MISMAS funciones que usa la app.
// Sin importar el .ts (CI corre en Node 20): se compara el texto de la fuente.
const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = readFileSync(join(aqui, '..', 'apps', 'web', 'lib', 'brandColors.ts'), 'utf8');
const cuerpoTs = fuente.slice(fuente.indexOf('export function brandFillPair'));
const cuerpoInk = fuente.slice(fuente.indexOf('export function brandInk'), fuente.indexOf('export function brandFillHover'));
const cuerpoHover = fuente.slice(fuente.indexOf('export function brandFillHover'), fuente.indexOf('// `hex` con alpha'));
const cuerpo = cuerpoTs + cuerpoInk + cuerpoHover;
const pasos = [
  'if (onInk >= 4.5) return',
  'if (onPaper >= 4.5) return',
  'const hacia = onInk >= onPaper ? PAPER : INK;',
  'for (let m = 0.04; m <= 1.001; m += 0.04)',
  'if (contrastBetween(rgb, PAPER_3) >= 4.5) return toHex(rgb);',
  'for (let f = 0.995; f >= 0; f -= 0.005)',
  'contrastBetween(parseHex(candidato)!, PAPER_3) >= 4.5',
  'const texto = on === INK_HEX ? INK : PAPER;',
  'for (let m = 0.12; m >= 0.02; m -= 0.02)',
];
const faltan = pasos.filter((p) => !cuerpo.includes(p));
if (faltan.length > 0) {
  console.error('\nbrandFillPair o brandInk cambiaron en apps/web/lib/brandColors.ts y esta copia quedó vieja.');
  console.error('Pasos que ya no coinciden:\n  - ' + faltan.join('\n  - '));
  process.exit(1);
}

const css = readFileSync(join(aqui, '..', 'apps', 'web', 'app', 'b', '[brand]', 'client.css'), 'utf8');
// Ningún BOTÓN puede ajustar su color con un filtro: el filtro corre DESPUÉS
// de que este test midió el par y lo puede sacar de AA (con #E91E63,
// brightness(1.05) llevaba el CTA de 4.58:1 a 4.20:1). Los filtros sobre FOTOS
// —el flyer difuminado del fondo— no entran acá: no llevan texto encima.
// El guard mira la regla entera, no una clase sola: la primera versión solo
// miraba .b-btn--go y se le escapó .c-btn--brand, que tenía el mismo defecto.
const reglasConFiltro = [];
for (const m of css.matchAll(/([^{}]+){([^}]*)}/g)) {
  const sel = m[1].trim();
  const cuerpo = m[2];
  if (/btn/i.test(sel) && /filter:[^;]*brightness/i.test(cuerpo)) reglasConFiltro.push(sel.replace(/\s+/g, ' '));
}
if (reglasConFiltro.length > 0) {
  console.error('\nHay botones que ajustan su color con filter: brightness. Eso mueve el relleno DESPUÉS de medirlo y rompe el par. Usá --brand-fill-hover (brandFillHover).');
  console.error('  - ' + reglasConFiltro.join('\n  - '));
  process.exit(1);
}

// Y el par invertido del concepto 2 (fondo --on-fill, texto --brand-fill) tiene
// que definir SU propio hover. Sin él, la regla general de .b-btn--go:hover le
// gana por especificidad, le cambia solo el fondo y deja el texto del otro par:
// fondo y texto casi del mismo color, botón de pagar sin texto.
if (/\.b-c2 \.b-btn--go \{[^}]*--on-fill/.test(css) && !/\.b-c2 \.b-btn--go:hover/.test(css)) {
  console.error('\nEl .b-c2 .b-btn--go invierte el par pero no define su hover. La regla general se lo pisa y el texto queda del color del fondo.');
  process.exit(1);
}

if (cuerpoInk.includes('contrastOnWhite') || cuerpoInk.includes('>= 2.8')) {
  console.error('\nbrandInk volvió a medir contra blanco o al umbral 2.8:1. El piso es AA 4.5:1 contra paper-3.');
  process.exit(1);
}

if (fallos > 0) {
  console.error(`\n${fallos} caso(s) no llegan a ${MIN}:1. brandFillPair y brandInk tienen que garantizarlo.`);
  process.exit(1);
}
console.log(`\nOK — los ${MARCAS.length} colores pasan ${MIN}:1 por los TRES caminos: relleno+texto (brandFillPair), su hover (brandFillHover) y el color como tinta (brandInk). Copias al día con brandColors.ts.`);
