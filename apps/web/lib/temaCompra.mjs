// Tema del sitio del COMPRADOR por marca (0076, Paul 2026-09-28): blanco,
// crema, negro o "marca" (el fondo del color de la marca). Devuelve la
// paleta completa que b/[brand]/layout.tsx inyecta como variables CSS.
//
// JS PURO a propósito (con temaCompra.d.mts para TypeScript): lo importan la
// app y el test de CI (scripts/check-temas-compra.mjs) — el CI corre en
// Node 20 sin npm install y no puede importar un .ts. Una sola fuente, sin
// copias que se desfasen.
//
// Reglas (CLAUDE.md, sistema de diseño):
//   - fondos neutros en blanco y negro; crema = el papel de la landing;
//   - --ink-2 / --ink-3 se CALCULAN contra la superficie más desfavorable
//     (--selected): ink-2 ≥ 6:1 e ink-3 ≥ 4.5:1 (AA), como el negro de hoy
//     (#A3A3A3 = 6.46:1 y #8A8A8A = 4.72:1 sobre #202020);
//   - "marca": el texto es blanco o #0A0A0A, el que más contraste dé, y el
//     fondo se corre lo MÍNIMO (de a 2%) hasta que el texto llegue a 5.5:1
//     (ink-2 e ink-3 ≥ 4.5); las superficies se alejan de la tinta. Ahí el botón es de TINTA (el
//     color de marca ya es el fondo) y la marca (punto, anillo) es la tinta;
//   - la marca como punto/anillo/barra en los demás temas: ≥ 3:1 contra el
//     fondo (WCAG 1.4.11), corrida lo mínimo si no llega.

export const TEMAS = ['blanco', 'crema', 'negro', 'marca'];
export const esTema = (v) => (TEMAS.includes(v) ? v : 'blanco');

const parse = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const canal = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
export const contraste = (a, b) => {
  const x = lum(typeof a === 'string' ? parse(a) : a);
  const y = lum(typeof b === 'string' ? parse(b) : b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const mix = (a, b, m) => [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m, a[2] + (b[2] - a[2]) * m];
// Mezcla ya redondeada a hex (lo que de verdad se pinta es lo que se mide).
const mixR = (a, b, m) => parse(hex(mix(a, b, m)));
const rgba = (rgb, a) => `rgba(${rgb.map(Math.round).join(', ')}, ${a})`;

const NEGRO = [0x0a, 0x0a, 0x0a];
const BLANCO = [0xff, 0xff, 0xff];
const TANGERINA = [0xff, 0x6a, 0x3d];
// Tema "marca": la tinta sobre el fondo de la marca (AA 4.5 + margen). Los
// secundarios, ≥ 4.5 (no hay lugar para la jerarquía de 6:1 sin lavar la marca).
export const MARCA_TINTA = 5.5;

// El tono más suave de la tinta que todavía llega al piso contra `peor`.
function tono(ink, bg, peor, piso) {
  let mejor = ink;
  for (let m = 0.02; m <= 0.9; m += 0.02) {
    const c = mixR(ink, bg, m);
    if (contraste(c, peor) >= piso) mejor = c; else break;
  }
  return mejor;
}

// La marca como punto/anillo/barra: ≥ 3:1 contra el fondo.
function marcaSobre(brand, bg, oscuro) {
  if (contraste(brand, bg) >= 3) return brand;
  const hacia = oscuro ? BLANCO : NEGRO;
  for (let m = 0.02; m <= 1.001; m += 0.02) {
    const c = mixR(brand, hacia, m);
    if (contraste(c, bg) >= 3) return c;
  }
  return hacia;
}

function paleta(bg, surface, surface2, selected, ink, ink2, ink3) {
  const oscuro = lum(bg) < 0.2;
  return { bg, surface, surface2, selected, ink, ink2, ink3, oscuro };
}

const FIJAS = {
  negro: () => paleta(NEGRO, parse('#141414'), parse('#1C1C1C'), parse('#202020'), BLANCO, parse('#A3A3A3'), parse('#8A8A8A')),
  blanco: () => {
    const bg = BLANCO, sel = parse('#E4E4E6'), ink = NEGRO;
    return paleta(bg, parse('#F4F4F5'), parse('#EAEAEB'), sel, ink, tono(ink, bg, sel, 6), tono(ink, bg, sel, 4.5));
  },
  crema: () => {
    const bg = parse('#FBF7F0'), sel = parse('#E8DDC9'), ink = parse('#231C17');
    return paleta(bg, parse('#F3ECDF'), parse('#EFE6D6'), sel, ink, tono(ink, bg, sel, 6), tono(ink, bg, sel, 4.5));
  },
};

function paletaMarca(brand) {
  const ink = contraste(brand, BLANCO) >= contraste(brand, NEGRO) ? BLANCO : NEGRO;
  const lejos = ink === BLANCO ? NEGRO : BLANCO; // correr lejos de la tinta
  for (let k = 0; k <= 50; k++) {
    const bg = mixR(brand, lejos, k * 0.02);
    // Las superficies se ALEJAN de la tinta (con texto blanco, un poco más
    // oscuras): el fondo queda como el caso más desfavorable y el color de la
    // marca se corre lo mínimo (el rojo de Code casi no cambia).
    if (contraste(ink, bg) < MARCA_TINTA) continue;
    const s1 = mixR(bg, lejos, 0.06), s2 = mixR(bg, lejos, 0.10), sel = mixR(bg, lejos, 0.14);
    return paleta(bg, s1, s2, sel, ink, tono(ink, bg, bg, 4.5), tono(ink, bg, bg, 4.5));
  }
  return FIJAS[ink === BLANCO ? 'negro' : 'blanco']();
}

// Paleta + variables CSS del sitio del comprador.
//   fill/onFill: el botón principal cuando el tema es "marca" (en los demás
//   manda brandFillPair, que layout.tsx ya calcula y el test de marca mide).
export function paletaCompra(tema, brandHex) {
  const t = esTema(tema);
  const brand = parse(brandHex) ?? TANGERINA;
  const p = t === 'marca' ? paletaMarca(brand) : FIJAS[t]();
  const mark = t === 'marca' ? p.ink : marcaSobre(brand, p.bg, p.oscuro);
  const hover = mixR(p.ink, p.bg, 0.1);
  const vars = {
    '--bg': hex(p.bg), '--surface': hex(p.surface), '--surface-2': hex(p.surface2), '--selected': hex(p.selected),
    '--ink': hex(p.ink), '--ink-2': hex(p.ink2), '--ink-3': hex(p.ink3),
    '--line': rgba(p.ink, 0.12),
    '--edge': rgba(p.ink, 0.22), '--edge-soft': rgba(p.ink, 0.10), '--edge-faint': rgba(p.ink, 0.08),
    '--edge-hover': rgba(p.ink, 0.30), '--edge-strong': rgba(p.ink, 0.45),
    '--ink-hover': hex(hover),
    // Lo que se ve al tocar un control (review de Codex): tinta al 6 %.
    '--sel': rgba(p.ink, 0.06),
    '--material': rgba(p.bg, 0.72),
    '--brand-mark': hex(mark),
  };
  const boton = t === 'marca'
    ? { fill: hex(p.ink), onFill: hex(p.bg), hover: hex(mixR(p.ink, p.bg, 0.12)) }
    : null;
  return { tema: t, oscuro: p.oscuro, vars, boton, hex: { bg: hex(p.bg), ink: hex(p.ink), ink2: hex(p.ink2), ink3: hex(p.ink3), surface: hex(p.surface), surface2: hex(p.surface2), selected: hex(p.selected), mark: hex(mark) } };
}
