// Theming por marca para el sitio público del comprador.
// La base es SIEMPRE crema; el primary_color de la marca caracteriza (acentos).
// El color de texto SOBRE el color de marca se calcula por luminancia para que
// SIEMPRE se lea, sea cual sea el color que cargó la marca (amarillo→texto
// oscuro, azul/negro→texto claro).

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Color de texto legible sobre `hex` (YIQ perceptual). Ink cálido o blanco.
export function contrastOn(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return '#231C17';
  const [r, g, b] = rgb;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#231C17' : '#FFFFFF';
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
