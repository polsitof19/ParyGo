// Contraste del COLOR DE MARCA en el sitio del comprador.
//
// La regla dura del sistema: --brand nunca porta texto "a ojo", porque el
// promotor elige cualquier color. Lo único que puede llevar texto encima es el
// par calculado --brand-fill / --on-fill (brandFillPair), y este test verifica
// que ese par llegue a AA 4.5:1 para TODOS los colores de marca que nos
// importan, incluidos los casos borde (negro, blanco, amarillo, tonos medios).
//
// Corre con `npm run test:contrast` (después del test de tokens fijos).
import { brandFillPair } from '../apps/web/lib/brandColors.ts';

const MIN = 4.5;

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
];

function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const [hi, lo] = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let fallos = 0;
console.log('Par relleno/texto del color de marca (mínimo AA 4.5:1)\n');
for (const [nombre, color] of MARCAS) {
  const { fill, on } = brandFillPair(color);
  const r = ratio(fill, on);
  const ok = r >= MIN;
  if (!ok) fallos += 1;
  const movido = fill.toLowerCase() !== color.toLowerCase();
  console.log(
    `${ok ? 'OK  ' : 'FALLA'} ${nombre.padEnd(20)} ${color}  →  relleno ${fill} · texto ${on}  ${r.toFixed(2)}:1${movido ? '  (relleno corrido para que se lea)' : ''}`,
  );
}

if (fallos > 0) {
  console.error(`\n${fallos} color(es) de marca no llegan a ${MIN}:1. brandFillPair tiene que garantizarlo.`);
  process.exit(1);
}
console.log(`\nOK — los ${MARCAS.length} colores de marca llegan a ${MIN}:1 con su texto.`);
