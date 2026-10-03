// Contraste de la PUERTA (apps/web/app/scan/scan.css, scope .scan-shell).
//
// La puerta tiene paleta propia porque no es un panel: es una pantalla que se
// mira de noche, a un brazo de distancia, con la mano ocupada. Justamente por
// eso se mide igual que el resto.
//
// Los valores se LEEN del CSS, no se copian acá: si alguien cambia un token de
// la puerta y baja de AA, este test falla. Corre dentro de `npm run test:contrast`.
//
// Lo que se mide es lo que PORTA TEXTO. El acento, los puntos de estado y los
// bordes no entran: la regla del sistema es que no llevan texto encima.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'apps/web/app/scan/scan.css');
const css = readFileSync(CSS, 'utf8');

// Los tokens del bloque .scan-shell { ... }
const bloque = /\.scan-shell\s*\{([\s\S]*?)\}/.exec(css);
if (!bloque) { console.error('FAIL  no se encontró el bloque .scan-shell en scan.css'); process.exit(1); }
const tok = {};
for (const m of bloque[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) tok[m[1]] = m[2].trim();

function parse(v) {
  let m = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(v);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
  throw new Error(`color no reconocido en scan.css: ${v}`);
}
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
const ratio = (fgRaw, bgRaw) => {
  const bg = parse(bgRaw);
  const c = over(parse(fgRaw), bg);
  const a = L(c), b = L(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const t = (k) => { if (!(k in tok)) throw new Error(`falta --${k} en .scan-shell`); return tok[k]; };

const BLANCO = '#FFFFFF';
// [qué es, texto, fondo, mínimo]
const CASOS = [
  // Texto sobre las cuatro superficies de la puerta.
  ...['ink', 'ink-2', 'ink-3'].flatMap((f) =>
    ['cream', 'cream-2', 'cream-3', 'white'].map((b) => [`--${f} sobre --${b}`, t(f), t(b), 4.5])
  ),
  // Botón de acción: TINTA sobre naranja, nunca blanco.
  ['k-btn--brand: tinta sobre naranja', t('ink'), t('tangerine'), 4.5],
  // Panel de resultado: texto blanco sobre el tono. El rótulo es gigante pero
  // el tipo de entrada (17px) y el subtexto (14px) NO son texto grande, así
  // que se le pide 4.5 a los tres tonos.
  ['resultado PASA: blanco sobre --ok', BLANCO, t('ok'), 4.5],
  ['resultado NO PASA: blanco sobre --deny', BLANCO, t('deny'), 4.5],
  ['resultado YA USADO: blanco sobre --warn', BLANCO, t('warn'), 4.5],
  // "NO PASAR" es texto de alerta sobre blanco.
  ['k-nopass: --deny sobre blanco', t('deny'), BLANCO, 4.5],
];

let fail = false;
console.log('PUERTA (.scan-shell) — contraste de lo que porta texto');
for (const [nombre, fg, bg, min] of CASOS) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fail = true;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${nombre.padEnd(38)} ${r.toFixed(2).padStart(6)}:1  (mín ${min})`);
}

// El acento como texto NO se usa: se informa para dejar constancia de por qué.
const acento = ratio(t('tangerine'), t('cream'));
console.log(`\n  (referencia) --tangerine como texto sobre la crema: ${acento.toFixed(2)}:1 — por eso no porta texto.`);
console.log(`  (referencia) blanco sobre --tangerine: ${ratio(BLANCO, t('tangerine')).toFixed(2)}:1 — por eso el botón va en tinta.`);

// Y que nadie reintroduzca el gris hex que ya falló una vez.
if (/--ink-3:\s*#/.test(bloque[1])) {
  console.log('\nFAIL  --ink-3 volvió a ser un gris hex fijo. Tiene que ser alfa de la tinta');
  console.log('      (un hex no se compone contra las cremas: #A89B8C daba 2,54:1).');
  fail = true;
}

process.exit(fail ? 1 : 0);
