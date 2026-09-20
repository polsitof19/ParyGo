// Contraste del COLOR DE MARCA en el sitio del comprador.
//
// La regla dura del sistema: --brand nunca porta texto "a ojo", porque el
// promotor elige cualquier color. Lo único que puede llevar texto encima es el
// par relleno+texto que calcula brandFillPair(), y este test verifica que ese
// par llegue a AA 4.5:1 para todos los colores de marca que importan,
// incluidos los casos borde (negro, blanco, amarillo, tonos medios).
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

// La copia de arriba tiene que seguir siendo la MISMA función que usa la app.
// Sin importar el .ts (CI corre en Node 20): se compara el texto de la fuente.
const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = readFileSync(join(aqui, '..', 'apps', 'web', 'lib', 'brandColors.ts'), 'utf8');
const cuerpoTs = fuente.slice(fuente.indexOf('export function brandFillPair'));
const pasos = [
  'if (onInk >= 4.5) return',
  'if (onPaper >= 4.5) return',
  'const hacia = onInk >= onPaper ? PAPER : INK;',
  'for (let m = 0.04; m <= 1.001; m += 0.04)',
];
const faltan = pasos.filter((p) => !cuerpoTs.includes(p));
if (faltan.length > 0) {
  console.error('\nbrandFillPair cambió en apps/web/lib/brandColors.ts y esta copia quedó vieja.');
  console.error('Pasos que ya no coinciden:\n  - ' + faltan.join('\n  - '));
  process.exit(1);
}

if (fallos > 0) {
  console.error(`\n${fallos} color(es) de marca no llegan a ${MIN}:1. brandFillPair tiene que garantizarlo.`);
  process.exit(1);
}
console.log(`\nOK — los ${MARCAS.length} colores de marca llegan a ${MIN}:1 con su texto (copia al día con brandColors.ts).`);
