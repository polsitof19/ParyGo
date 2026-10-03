// Function de la LANDING (proyecto Pages "parygo"). Corre antes de servir los
// assets estáticos y se ocupa de tres cosas de dominio:
//
//   1. Las páginas legales viven en la APP, no acá → 301 a app.parygo.com.
//   2. El dominio por defecto de Pages (parygo.pages.dev) → 301 al canónico.
//   3. El archivo de verificación de Google Search Console.
//
// El orden importa: las legales se resuelven ANTES del 301 de pages.dev, para
// que parygo.pages.dev/terminos llegue al destino final en UN solo salto en
// vez de encadenar dos.
//
// Por qué acá y no en public/_redirects: este Function está verificado en
// producción (el 301 de pages.dev y el archivo de GSC responden), mientras que
// la regla catch-all de _redirects no se comporta de forma concluyente en este
// proyecto (una ruta inexistente devuelve 404, no el 200 que pide la regla).
// Una sola puerta para las decisiones de dominio es mejor que dos.

// Rutas que la landing NO tiene y que sí existen en la app. Sin barra final:
// app.parygo.com canonicaliza /terminos/ → /terminos con un 308, así que
// apuntar a la forma con barra encadenaría un salto de más.
//
// Es un Map y no un objeto literal A PROPÓSITO: la clave viene de la URL, y
// `{}['constructor']` o `{}['toString']` devuelven algo heredado de
// Object.prototype. Con un objeto, /constructor habría entrado acá como si
// fuera una ruta legal y habría reventado al armar el Response.redirect.
const LEGALES = new Map([
  ['/terminos', 'https://app.parygo.com/terminos'],
  ['/privacidad', 'https://app.parygo.com/privacidad'],
]);

// Archivo de verificación de Google Search Console. Se sirve desde el Function
// (no como asset estático) porque CF Pages canonicaliza los .html a sin-extensión
// con un 308, y Google exige un 200 literal en la URL exacta .../google<code>.html.
// El Function intercepta antes de esa canonicalización y devuelve el body exacto.
const GSC_PATH = '/google3855ddac0c3e7051.html';
const GSC_BODY = 'google-site-verification: google3855ddac0c3e7051.html';

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.pathname === GSC_PATH) {
    return new Response(GSC_BODY, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  // Legales → la app. Se acepta con y sin barra final (la landing tiene
  // trailingSlash: true, así que los links internos y lo que ya está indexado
  // pueden venir de las dos formas). La query se preserva: si alguien llega
  // con ?utm_source=..., no se pierde la atribución.
  const legal = LEGALES.get(url.pathname.replace(/\/+$/, '') || '/');
  if (legal) {
    return Response.redirect(legal + url.search, 301);
  }

  if (url.hostname === 'parygo.pages.dev') {
    url.protocol = 'https:';
    url.hostname = 'parygo.com';
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}
