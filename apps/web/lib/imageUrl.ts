// Optimización de imágenes vía las transformaciones de Supabase Storage
// (endpoint /render/image). Reescribe la URL pública a una versión
// redimensionada + recomprimida, así un flyer/logo de varios MB se sirve liviano
// (clave en móvil 3G/4G). Solo presentación — no toca datos ni pagos.
//
// Seguro por diseño: si la URL NO es de Supabase Storage (otro host) o es un SVG
// (vectorial, ya liviano y el render no lo transforma) se devuelve tal cual.
const OBJECT = '/storage/v1/object/public/';
const RENDER = '/storage/v1/render/image/public/';

export function optimizedImage(
  url: string | null | undefined,
  opts: { width: number; quality?: number }
): string | undefined {
  if (!url) return undefined;
  if (!url.includes(OBJECT)) return url; // no es storage de Supabase
  if (/\.svg(\?|#|$)/i.test(url)) return url; // SVG: no transformar
  const quality = opts.quality ?? 75;
  return `${url.replace(OBJECT, RENDER)}?width=${opts.width}&quality=${quality}`;
}
