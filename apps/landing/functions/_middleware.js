// 301 del dominio por defecto de Cloudflare Pages (parygo.pages.dev) hacia el
// dominio canónico (parygo.com), preservando ruta + query. Objetivo SEO: que la
// pages.dev deje de competir en Google y consolide todo en parygo.com.
// Se acota a EXACTAMENTE parygo.pages.dev para no afectar los previews
// (<hash>.parygo.pages.dev) del landing.
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
  if (url.hostname === 'parygo.pages.dev') {
    url.protocol = 'https:';
    url.hostname = 'parygo.com';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
