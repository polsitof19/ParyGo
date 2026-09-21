// =============================================================
// Conceptos de diseño de la página de compra
// =============================================================
// Tres propuestas completas conviven detrás de ?c=1|2|3 para que Paul las
// compare en el mismo evento real, en el mismo preview:
//
//   1  CARTEL   el flyer manda; las fases son una línea de tiempo.
//   2  ENTRADA  el bloque de compra ES un boleto, con talón.
//   3  NOCHE    editorial oscuro, tipografía enorme.
//
// Es SOLO presentación: ninguno cambia precios, stock, pago ni emisión. El
// concepto viaja por la query para que el recorrido entero —entradas, datos,
// Yape y la entrada con QR— se vea con la misma piel.
//
// ?v=a|b era el selector anterior (dos direcciones de arte). Se mantiene como
// alias para no romper links viejos: a → 1, b → 3.

export type Concepto = 1 | 2 | 3;

type Query = Record<string, string | string[] | undefined> | undefined;

function uno(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

export function leerConcepto(sp: Query): Concepto {
  const c = uno(sp?.c).trim();
  if (c === '2') return 2;
  if (c === '3') return 3;
  if (c === '1') return 1;
  const v = uno(sp?.v).trim().toLowerCase();
  if (v === 'b') return 3;
  return 1;
}

/** Agrega ?c= a una URL interna, salvo que sea el concepto por defecto. */
export function conConcepto(url: string, c: Concepto): string {
  if (c === 1) return url;
  return url + (url.includes('?') ? '&' : '?') + `c=${c}`;
}
