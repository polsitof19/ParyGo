// 301 del dominio por defecto de Cloudflare Pages (parygo.pages.dev) hacia el
// dominio canónico (parygo.com), preservando ruta + query. Objetivo SEO: que la
// pages.dev deje de competir en Google y consolide todo en parygo.com.
// Se acota a EXACTAMENTE parygo.pages.dev para no afectar los previews
// (<hash>.parygo.pages.dev) del landing.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === 'parygo.pages.dev') {
    url.protocol = 'https:';
    url.hostname = 'parygo.com';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
