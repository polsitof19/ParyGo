// Funciones puras de color de marca, compartidas entre el sitio público del
// comprador (app/b/[brand]) y los paneles que editan el branding (super admin /
// dueño) para previsualizar el contraste automático. Sin dependencias de React
// ni del server → importable desde client y server components.
//
// La base de las páginas es SIEMPRE crema; el primary_color caracteriza (acentos).
// Nada de color de marca sobre texto "a ojo": las dos funciones que lo permiten
// —brandInk() para texto DEL color de marca, brandFillPair() para texto SOBRE
// él— garantizan AA 4.5:1 y las verifica scripts/check-brand-contrast.mjs.

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Luminancia relativa (WCAG) de un rgb 0..255.
function relLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function toHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// ⚠ Si tocás esta función, tocá también su copia en
// scripts/check-brand-contrast.mjs (mismo motivo que brandFillPair: el CI no
// puede importar un .ts). Ese test falla si las dos se separan.
//
// Variante del color de marca para usarlo como TEXTO sobre el papel crema
// (links al WhatsApp del organizador, "Reenviála a tu email", confirmaciones).
//
// PISO AA 4.5:1 CONTRA --paper-3 (#EFE6D6), no contra blanco. Dos razones:
//   - paper-3 es la más OSCURA de las cuatro superficies de papel, o sea el
//     peor caso; medir contra blanco da un número que la página no cumple.
//   - 4.5:1 es el mínimo de AA para texto normal, y esto es texto normal de
//     13-14px, no display.
// Antes el umbral era 2.8:1 contra blanco y devolvía el color crudo: el propio
// tangerina de ParyGo salía a 2.66:1 sobre paper y 2.30:1 sobre paper-3, o sea
// texto que no llegaba ni al 3:1 de texto grande. 9 de 13 colores de marca
// fallaban. Ese era el bug.
//
// Si el color ya llega, se devuelve TAL CUAL (la marca conserva su color vivo).
// Si no, se oscurece escalando el rgb —que preserva el tono— lo MÍNIMO
// necesario. El primary original sigue intacto para rellenos, hero y acentos
// grandes (eso usa --brand, no --brand-ink).
export function brandInk(hex?: string | null): string {
  const rgb = hex ? parseHex(hex) : null;
  if (!rgb) return INK_HEX;
  if (contrastBetween(rgb, PAPER_3) >= 4.5) return toHex(rgb);
  // Se baja el factor de a poco y se mide sobre el hex YA REDONDEADO: es el
  // color que termina en la página, y redondear puede comerse el último 0.01.
  for (let f = 0.995; f >= 0; f -= 0.005) {
    const candidato = toHex([rgb[0] * f, rgb[1] * f, rgb[2] * f]);
    if (contrastBetween(parseHex(candidato)!, PAPER_3) >= 4.5) return candidato;
  }
  return INK_HEX;
}

// ⚠ Copia en scripts/check-brand-contrast.mjs — si la tocás, tocá la otra.
//
// HOVER del relleno de marca. Existe porque el hover era `filter: brightness(1.05)`
// y eso rompía la garantía del par medido: el test mide el par estático y el
// filtro lo mueve DESPUÉS. Con #E91E63 el botón pasaba de 4.58:1 a 4.20:1 y con
// #607D8B de 4.56 a 4.19 — o sea que el estado en el que el comprador tiene el
// dedo encima era justo el que no cumplía AA.
//
// Acá el hover es otro COLOR, no un filtro, y sale medido: se profundiza hacia
// el texto (el gesto clásico de "se hunde") hasta un 12%, y se retrocede de a
// 2% mientras no llegue a 4.5:1. Si ni el 2% entra —el relleno ya estaba al
// límite— se va para el lado contrario, que siempre SUBE el contraste.
export function brandFillHover(hex?: string | null): string {
  const { fill, on } = brandFillPair(hex);
  const rgb = parseHex(fill)!;
  const texto = on === INK_HEX ? INK : PAPER;
  for (let m = 0.12; m >= 0.02; m -= 0.02) {
    const candidato = toHex(mix(rgb, texto, m));
    if (contrastBetween(parseHex(candidato)!, texto) >= 4.5) return candidato;
  }
  // Sin margen para profundizar: se aleja del texto. Alejarse de blanco o de
  // negro puro (no de PAPER/INK) garantiza que el contraste no baje nunca.
  const lejos: [number, number, number] = on === INK_HEX ? [255, 255, 255] : [0, 0, 0];
  return toHex(mix(rgb, lejos, 0.12));
}

// `hex` con alpha (para tintes suaves sobre crema). alpha 0..1.
export function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return `rgba(255,106,61,${alpha})`;
  const [r, g, b] = rgb;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Normaliza un primary_color de la marca (fallback tangerina parygo).
export function brandColor(hex?: string | null): string {
  const rgb = hex ? parseHex(hex) : null;
  return rgb ? (hex as string) : '#FF6A3D';
}

// Contraste WCAG entre dos rgb.
function contrastBetween(a: [number, number, number], b: [number, number, number]): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const INK: [number, number, number] = [0x23, 0x1c, 0x17];
const PAPER: [number, number, number] = [0xfb, 0xf7, 0xf0];
// La más oscura de las cuatro superficies de papel: el peor caso para medir
// texto encima. Es el mismo piso que usa el resto del sistema para --ink-2/3.
const PAPER_3: [number, number, number] = [0xef, 0xe6, 0xd6];
const INK_HEX = '#231C17';
const PAPER_HEX = '#FBF7F0';

// Mezcla `rgb` hacia `target` en proporción m (0..1).
function mix(rgb: [number, number, number], target: [number, number, number], m: number): [number, number, number] {
  return [rgb[0] + (target[0] - rgb[0]) * m, rgb[1] + (target[1] - rgb[1]) * m, rgb[2] + (target[2] - rgb[2]) * m];
}

// ⚠ Si tocás esta función, tocá también su copia en
// scripts/check-brand-contrast.mjs (el CI corre en Node 20 y sin npm install,
// así que no puede importar este .ts). Ese test falla si las dos se separan.
//
// RELLENO de marca apto para llevar texto (botón primario, círculo del paso
// activo, banda del ticket). La regla del sistema es que el color de marca no
// porta texto "a ojo", porque el promotor elige cualquier color: acá el par
// relleno + texto se calcula para que SIEMPRE llegue a AA 4.5:1.
//
// Se prefiere TINTA sobre el relleno (es la regla del sistema). Si el color es
// oscuro y la tinta no se leería, el texto pasa a papel —forzar tinta ahí
// obligaría a lavar el color hasta perder la marca—. Y si el color es de tono
// medio, donde NINGUNA de las dos llega, se corre el relleno lo mínimo hacia
// el lado que menos lo cambia.
export function brandFillPair(hex?: string | null): { fill: string; on: string } {
  const rgb = hex ? parseHex(hex) : null;
  if (!rgb) return { fill: '#FF6A3D', on: INK_HEX }; // tangerina parygo: 5.91:1
  const onInk = contrastBetween(rgb, INK);
  const onPaper = contrastBetween(rgb, PAPER);
  if (onInk >= 4.5) return { fill: toHex(rgb), on: INK_HEX };
  if (onPaper >= 4.5) return { fill: toHex(rgb), on: PAPER_HEX };
  // Tono medio: ninguna de las dos se lee. Se ajusta hacia el lado más cercano.
  const hacia = onInk >= onPaper ? PAPER : INK;
  const texto = onInk >= onPaper ? INK : PAPER;
  const textoHex = onInk >= onPaper ? INK_HEX : PAPER_HEX;
  for (let m = 0.04; m <= 1.001; m += 0.04) {
    const mezcla = mix(rgb, hacia, m);
    if (contrastBetween(mezcla, texto) >= 4.5) return { fill: toHex(mezcla), on: textoHex };
  }
  return { fill: toHex(hacia), on: textoHex };
}
