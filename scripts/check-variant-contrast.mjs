// Contraste de las DOS direcciones de arte de la página de compra
// (apps/web/app/b/[brand]/client.css, bloques .b-v-a y .b-v-b).
//
// Las alfas se componen contra su propio fondo, que es como las pinta el
// navegador: un rgba(.70) sobre papel no "es" la tinta, es la mezcla.
// Corre dentro de `npm run test:contrast`.
const MIN = 4.5;

const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lum = ([r, g, b]) => {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (fg, alpha, bg) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

const INK = hx('#231C17');
const PAPER = hx('#FBF7F0');
const NOCHE = hx('#14110E');

// [nombre, color, alfa, fondo, mínimo]. El hairline no porta texto: solo se
// le pide que se vea (1.5:1 basta para una línea de 1px).
const CASOS = [
  ['A · texto sobre papel', INK, 1, PAPER, MIN],
  ['A · texto secundario (.70)', INK, 0.70, PAPER, MIN],
  ['A · fase bloqueada (.62)', INK, 0.62, PAPER, MIN],
  ['B · texto sobre noche', PAPER, 1, NOCHE, MIN],
  ['B · texto secundario (.72)', PAPER, 0.72, NOCHE, MIN],
  ['B · fase bloqueada (.62)', PAPER, 0.62, NOCHE, MIN],
  ['B · hairline (.16) — no porta texto', PAPER, 0.16, NOCHE, 1.5],
];

console.log('\nDirecciones de arte de la compra (clara / noche)\n');
let fallos = 0;
for (const [nombre, fg, alpha, bg, min] of CASOS) {
  const r = ratio(over(fg, alpha, bg), bg);
  const ok = r >= min;
  if (!ok) fallos += 1;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre.padEnd(36)} ${r.toFixed(2)}:1  (mín ${min})`);
}

if (fallos > 0) {
  console.error(`\n${fallos} caso(s) de las direcciones de arte no llegan al mínimo.`);
  process.exit(1);
}
console.log('\nOK — las dos direcciones cumplen AA en todo el texto que informa.');
