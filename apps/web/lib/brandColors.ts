// Funciones puras de color de marca, compartidas entre el sitio público del
// comprador (app/b/[brand]) y los paneles que editan el branding (super admin /
// dueño) para previsualizar el contraste automático. Sin dependencias de React
// ni del server → importable desde client y server components.
//
// La base de las páginas es SIEMPRE crema; el primary_color caracteriza (acentos).
// El color de texto SOBRE el color de marca se calcula por luminancia para que
// SIEMPRE se lea (amarillo→texto oscuro, azul/negro→texto claro).

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

// Luminancia relativa (WCAG) de un rgb 0..255.
function relLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Contraste WCAG contra blanco (el fondo más exigente: crema ≈ blanco). Cuanto
// más bajo, menos legible es el color como TEXTO sobre crema/blanco.
function contrastOnWhite(rgb: [number, number, number]): number {
  return (1 + 0.05) / (relLuminance(rgb) + 0.05);
}

function toHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// Variante del color de marca para usarlo como TEXTO/acento sobre el fondo crema.
// Si el primary ya contrasta bien (colores medios/oscuros: rojo, azul, tangerina)
// se devuelve TAL CUAL (la marca conserva su color vivo en los textitos). Si es
// muy claro (amarillo, pasteles), se oscurece preservando el tono —escalando el
// rgb— hasta que se lea cómodo. El primary original sigue intacto para botones,
// hero y acentos grandes (eso usa --brand, no --brand-ink).
export function brandInk(hex?: string | null): string {
  const rgb = hex ? parseHex(hex) : null;
  if (!rgb) return '#231C17';
  // Ya legible como texto sobre crema/blanco → conservar el color vivo.
  if (contrastOnWhite(rgb) >= 2.8) return toHex(rgb);
  // Demasiado claro: oscurecer (preservando tono) hasta un contraste cómodo.
  for (let f = 0.96; f >= 0.12; f -= 0.04) {
    const d: [number, number, number] = [rgb[0] * f, rgb[1] * f, rgb[2] * f];
    if (contrastOnWhite(d) >= 3.5) return toHex(d);
  }
  return toHex([rgb[0] * 0.12, rgb[1] * 0.12, rgb[2] * 0.12]);
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
