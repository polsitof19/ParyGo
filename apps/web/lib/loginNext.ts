// A dónde volver después de entrar. `next` lo pone la pantalla que pidió el
// login (p. ej. el escáner, cuando la sesión venció): sin esto el organizador
// abría el escáner, le pedía entrar y terminaba en el panel, que se veía como
// "la página se reinició". Solo se aceptan DOS destinos propios, y solo si el
// rol del usuario ya lleva ahí: nada de URLs de afuera (open redirect) ni de
// saltar a una pantalla que su rol no ve. `destino` es el que decide
// destinationForUser por rol. Lo prueba e2e/login-next.test.mts.
export function volverA(next: string, destino: string): string {
  // Alta con código (0080): quien pagó en otro navegador entra y vuelve a
  // reclamar su marca. Solo esa ruta exacta (compra = UUID): /listo decide si
  // la sesión es la dueña prevista.
  if (/^\/empezar\/listo\?compra=[0-9a-f-]{36}(&lang=(es|en))?$/i.test(next)) return next;
  if (!/^\/(scan|admin)(\/[A-Za-z0-9/_-]*)?$/.test(next)) return destino;
  // El escáner lo pueden abrir el validador (destino /scan) y el organizador
  // (destino /admin). El panel, solo el organizador.
  if (next.startsWith('/scan') && (destino === '/scan' || destino === '/admin')) return '/scan';
  if (next.startsWith('/admin') && destino === '/admin') return next;
  return destino;
}
