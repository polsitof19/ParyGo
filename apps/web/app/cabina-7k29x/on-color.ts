// Color de texto sobre un fondo arbitrario (color de marca elegido por el
// organizador o color de hash del avatar).
//
// Por qué existe: la inicial del avatar iba SIEMPRE en #fff. Blanco sobre
// --accent (#FF6A3D) mide 2.85:1 y sobre --warn (#C7791A) 3.40:1 — ninguna
// llega a AA (4.5:1), y 16px/800 NO es "texto grande" en WCAG (eso empieza en
// 18.66px bold). Elegir tinta o blanco según la luminancia del fondo arregla
// todos los naranjas y amarillos sin tocar el color de marca.
//
// No garantiza AA para CUALQUIER color: un fondo de luminancia media (un gris
// #808080) no llega a 4.5:1 con ninguno de los dos. Garantiza el MEJOR de los
// dos, que es lo máximo que se puede hacer sin cambiarle el color a la marca.
// La inicial es redundante igual: el nombre de la marca va al lado, en tinta.
//
// Por qué NO es lib/brandColors.contrastOn: esa usa el umbral YIQ >= 150, que
// para #FF6A3D da 145.4 y elige BLANCO — justo la opción peor (2.85:1 contra
// 5.91:1 de la tinta). Arreglarla ahí cambiaría también el sitio público del
// comprador, que tiene una venta en curso y no puedo verificar en esta pasada.
// Las dos se unifican cuando le toque el turno al checkout público.

const INK = '#231C17';

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const [r, g, b] = [0, 2, 4].map((i) => srgbToLinear(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Tinta o blanco — el que más contraste dé sobre `bg`. Si `bg` no es un hex
 *  reconocible (var(...), rgb(...), vacío), devuelve tinta: el fondo por
 *  defecto del panel es claro. */
export function onColor(bg: string | null | undefined): string {
  const L = bg ? luminance(bg) : null;
  if (L === null) return INK;
  const Link = luminance(INK) as number;
  const withInk = (Math.max(L, Link) + 0.05) / (Math.min(L, Link) + 0.05);
  const withWhite = (1.0 + 0.05) / (L + 0.05);
  return withWhite > withInk ? '#FFFFFF' : INK;
}

// Paleta de fondo del avatar cuando la marca no subió logo ni eligió color.
// Los dos violetas se oscurecieron un 5% respecto de los originales
// (#5B6CFF → #5667F2, #8A5BFF → #8356F2) para que la inicial en blanco llegue
// a 4.56:1 y 4.57:1. Con eso los SEIS colores pasan AA; antes los violetas se
// quedaban en 4.17:1. Mismo orden y misma longitud, así que el hash de cada
// marca sigue cayendo en el mismo slot.
export const AVATAR_BG = ['#FF6A3D', '#5667F2', '#E8552A', '#2E9E6B', '#C7791A', '#8356F2'];

export const bgFor = (s: string) => AVATAR_BG[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_BG.length];

export const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase();
