// =============================================================
// Conceptos de diseño de la página de compra
// =============================================================
// En producción manda UNO: el 2, ENTRADA. Los otros dos siguen en el código
// para poder compararlos en vivo, pero solo en las marcas de prueba; para
// cualquier marca real ?c= queda inerte y sale ENTRADA. Así un link con ?c=3
// que alguien copie y pegue no le cambia la cara al evento de un promotor.
//
//   1  CARTEL   el flyer a pantalla completa manda; fases en línea de tiempo.
//   2  ENTRADA  el bloque de compra ES un boleto, con talón.  ← producción
//   3  NOCHE    editorial oscuro, tipografía grande.
//
// Es SOLO presentación: ninguno cambia precios, stock, pago ni emisión. El
// concepto viaja por la query para que el recorrido entero —entradas, datos,
// Yape y la entrada con QR— se vea con la misma piel.
//
// ?v=a|b era el selector anterior (dos direcciones de arte). Se mantiene como
// alias para no romper links viejos: a → 1, b → 3.

export type Concepto = 1 | 2 | 3;

/** El que ve todo el mundo. */
export const CONCEPTO_POR_DEFECTO: Concepto = 2;

/** Marcas donde ?c= sigue vivo, para comparar los tres sobre datos reales. */
const MARCAS_DE_PRUEBA = new Set(['koko', 'demotest', 'ensayo-paul']);

type Query = Record<string, string | string[] | undefined> | undefined;

function uno(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

/**
 * @param sp        searchParams de la página.
 * @param marcaSlug slug de la marca. Sin él, o si no es de prueba, devuelve
 *                  siempre el concepto de producción.
 */
export function leerConcepto(sp: Query, marcaSlug?: string): Concepto {
  if (!marcaSlug || !MARCAS_DE_PRUEBA.has(marcaSlug)) return CONCEPTO_POR_DEFECTO;
  const c = uno(sp?.c).trim();
  if (c === '1') return 1;
  if (c === '2') return 2;
  if (c === '3') return 3;
  const v = uno(sp?.v).trim().toLowerCase();
  if (v === 'a') return 1;
  if (v === 'b') return 3;
  return CONCEPTO_POR_DEFECTO;
}

/** Agrega ?c= a una URL interna, salvo que sea el concepto de producción. */
export function conConcepto(url: string, c: Concepto): string {
  if (c === CONCEPTO_POR_DEFECTO) return url;
  return url + (url.includes('?') ? '&' : '?') + `c=${c}`;
}
