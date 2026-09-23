// =============================================================
// Dirección de diseño de la página de compra
// =============================================================
// Hay DOS, y no las elige nadie a mano: las elige el flyer.
//
//   CANVAS     el flyer sangra y la compra flota encima, en papel.
//              Es la que mejor entra en un teléfono y la que se eligió
//              como diseño del producto. Necesita que el arte sirva.
//
//   EDITORIAL  manda la tipografía: el nombre del evento arriba y grande,
//              el flyer reducido a una banda. Es el respaldo, y es mejor
//              que CANVAS justamente cuando el arte NO sirve.
//
// La regla: CANVAS solo si el flyer existe y NO parece una captura de
// pantalla. Si no hay flyer, si no se pudo medir, o si la proporción lo
// delata, va EDITORIAL.
//
// Por qué importa: el promotor recibe el flyer por WhatsApp, le saca captura
// y sube eso. Medido sobre los flyers reales de la base el 2026-09-22:
//   koko    1080×1350  ratio .800  → CANVAS
//   hoesky  1320×2868  ratio .460  → EDITORIAL (es una captura de Instagram,
//                                    con la barra de "Seguir" y el reproductor)
// Con CANVAS esa captura se ve a sangre, con el chrome de Instagram y todo.
// Con EDITORIAL queda reducida a una banda y el evento lo sostiene el nombre.
//
// FAIL-SAFE a propósito: ante la duda, EDITORIAL. EDITORIAL se banca
// cualquier flyer; CANVAS no.
//
// ?c= quedó INERTE. Antes dejaba elegir concepto a mano en las marcas de
// prueba; ahora no hay nada que elegir y un link viejo con ?c=3 no cambia
// nada. La decisión es del flyer, no de la URL.

import { pareceCaptura } from './flyer';
import { medidasDeImagen } from './imageSize';

export type Direccion = 'canvas' | 'editorial';

/** La que se sirve cuando no se puede decidir. */
export const DIRECCION_SEGURA: Direccion = 'editorial';

/**
 * Decide la dirección a partir del flyer del evento.
 *
 * Con las medidas guardadas al subir el flyer (events.cover_w/cover_h, 0065)
 * decide SIN red. Solo si la fila no las tiene hace una petición chica a la
 * imagen (Range) con tope de tiempo; en ese caso conviene llamarla en paralelo
 * con las consultas de la página, no en serie: es la página que cobra.
 */
export async function decidirDireccion(
  coverUrl: string | null | undefined,
  medidas?: { w: number | null | undefined; h: number | null | undefined },
): Promise<Direccion> {
  if (!coverUrl) return 'editorial';
  if (medidas?.w && medidas?.h) {
    return pareceCaptura(medidas.w, medidas.h).esCaptura ? 'editorial' : 'canvas';
  }
  const m = await medidasDeImagen(coverUrl);
  if (!m) return DIRECCION_SEGURA;
  return pareceCaptura(m.width, m.height).esCaptura ? 'editorial' : 'canvas';
}

/** La clase que la dirección pone en el árbol. */
export function claseDireccion(d: Direccion): string {
  return d === 'canvas' ? 'b-canvas' : 'b-editorial';
}
