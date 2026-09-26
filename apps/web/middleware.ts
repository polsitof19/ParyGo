import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// =============================================================
// Multi-tenant subdomain router + Supabase auth cookie refresh
// =============================================================
// Hosts we handle:
//   - app.parygo.com         → super admin + auth pages (default app surface)
//   - <slug>.parygo.com      → brand-scoped public site (event pages, /t/[uuid])
//   - parygo-app.pages.dev   → canonical Pages URL, behaves like app host
//   - localhost:3001         → dev convenience: query param ?brand=code
//
// Strategy:
//   1. Resolve brand slug. Order of preference:
//        a) x-parygo-brand-slug — explicit hint from the CF Worker proxy that
//           sits in front of *.parygo.com (the worker rewrites Host to
//           parygo-app.pages.dev, so without this header the Pages app would
//           never see the real subdomain).
//        b) x-forwarded-host    — fallback if the worker forwards the original
//           host but not a slug.
//        c) Host header         — direct hit on app.parygo.com or pages.dev.
//        d) ?brand=… on localhost — local dev.
//   2. Rewrite path:
//        - app.* / pages.dev / apex → /(app)/<orig path>
//        - brand                    → /(brand)/<orig path>
//   3. Call Supabase SSR to refresh cookies (mandatory for Server Actions).
//
// IMPORTANT: middleware runs in the Edge runtime — no Node APIs.

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'parygo.com';
const APP_HOSTS = new Set([
  'app.' + ROOT_DOMAIN,
  ROOT_DOMAIN,
  'www.' + ROOT_DOMAIN,
  'localhost',
  'localhost:3001',
  '127.0.0.1',
  '127.0.0.1:3001',
]);

// Subdomains we never treat as brands (reserved).
const RESERVED_SUBDOMAINS = new Set([
  'app',
  'www',
  'api',
  'admin',
  'super',
  'docs',
  'status',
  'mail',
  'cdn',
  'static',
]);

// ---------------------------------------------------------------------------
// CACHÉ DE BORDE DE LAS PÁGINAS PÚBLICAS DE UNA MARCA (2026-09-22)
// ---------------------------------------------------------------------------
// Medido contra producción: con 50 pedidos en paralelo, la página pública
// devolvía 503 "Worker exceeded resource limits" en el 30-60% de los casos (y
// también /login, o sea que no es esta página: es el Worker). Con un evento
// gratis de miles de personas eso es una caída en el peor momento.
//
// La página de una marca y la de un evento son IGUALES para todos: no hay
// sesión de comprador, no hay carrito en el server, y el precio, el cupo y el
// reclamo se validan siempre server-side en el checkout. O sea que se puede
// servir desde el borde y que mil visitas cuesten una sola ejecución.
//
// Lo único que puede quedar viejo hasta 60s es el cartel de "Agotado".
// NO abre riesgo de sobreventa: quien toque "Reclama tu entrada" pasa igual por
// reserve_order_stock, que decide bajo lock.
//
// NO se cachea:
//   · nada que lleve sesión (cookies sb-*: el panel, la cabina),
//   · la entrada de una persona (/t/…), su pedido (/pedido/…), la
//     confirmación, el paso de Yape ni /reenviar — son de UNO,
//   · los links de promotor (?ref=…), porque su clic se registra en el server
//     y con caché se perdería el tracking,
//   · nada que no sea GET.
const RUTAS_PUBLICAS_CACHEABLES = /^\/(?:[a-z0-9][a-z0-9-]{0,80})?$/i;
const RUTAS_PERSONALES = /^\/(?:t|pedido|reenviar|confirmacion|yape)(?:\/|$)/i;

function sePuedeCachear(req: NextRequest, path: string): boolean {
  if (req.method !== 'GET') return false;
  if (RUTAS_PERSONALES.test(path)) return false;
  if (!RUTAS_PUBLICAS_CACHEABLES.test(path)) return false;
  // Sesión abierta → respuesta personal, nunca compartida.
  if (req.cookies.getAll().some((c) => c.name.startsWith('sb-'))) return false;
  // Link de promotor: su clic se cuenta en el server.
  const qs = new URL(req.url).searchParams;
  if (qs.has('ref')) return false;
  // Los parámetros de exploración de diseño (?c=, ?flyer=) no se cachean: son
  // para mirar variantes, no tráfico real.
  if (qs.has('c') || qs.has('flyer')) return false;
  return true;
}

function extractSubdomain(host: string): string | null {
  // Strip port
  const cleanHost = host.split(':')[0]?.toLowerCase() ?? '';
  if (!cleanHost) return null;
  // Vercel preview deployments: <project>-<branch>-<owner>.vercel.app — no brand
  if (cleanHost.endsWith('.vercel.app')) return null;
  // Cloudflare Pages canonical hosts: parygo-app.pages.dev, <hash>.parygo-app.pages.dev.
  // These are infra surfaces, never a brand.
  if (cleanHost.endsWith('.pages.dev')) return null;
  // Local dev override via query param handled in handler
  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1') return null;
  const parts = cleanHost.split('.');
  // parygo.com → no subdomain
  if (parts.length < 3) return null;
  const sub = parts[0]!;
  if (RESERVED_SUBDOMAINS.has(sub)) return null;
  return sub;
}

function isPagesDevHost(rawHost: string): boolean {
  return (rawHost.split(':')[0]?.toLowerCase() ?? '').endsWith('.pages.dev');
}

// Decide whether the request should render the app surface (super admin /
// login / etc.) instead of a brand-scoped page. Treat the canonical Pages
// hostnames like an app host so direct hits to parygo-app.pages.dev still
// work for debugging.
function isAppSurfaceHost(rawHost: string, effectiveHost: string): boolean {
  if (APP_HOSTS.has(effectiveHost.toLowerCase())) return true;
  if (APP_HOSTS.has((effectiveHost.split(':')[0] ?? '').toLowerCase())) return true;
  if (isPagesDevHost(rawHost)) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  // Hints injected by the CF Worker proxy in front of *.parygo.com.
  // The worker forwards traffic to parygo-app.pages.dev with the original
  // host rewritten, so we can't derive the brand from `req.headers.host`
  // alone — that field would be 'parygo-app.pages.dev' for every brand.
  const workerSlug = req.headers.get('x-parygo-brand-slug')?.trim() || null;
  const forwardedHost = req.headers.get('x-forwarded-host') ?? null;
  const rawHost = req.headers.get('host') ?? '';
  const effectiveHost = forwardedHost || rawHost;
  const cleanEffectiveHost = effectiveHost.split(':')[0]?.toLowerCase() ?? '';
  const url = req.nextUrl.clone();

  // ---- 1. Resolve brand slug ----
  // Order: explicit worker header → derive from the original host → dev override.
  let brandSlug: string | null =
    workerSlug || extractSubdomain(effectiveHost);

  // Dev convenience: ?brand=code on localhost lets us test brand routing
  if (
    !brandSlug &&
    (cleanEffectiveHost === 'localhost' || cleanEffectiveHost === '127.0.0.1')
  ) {
    const devBrand = url.searchParams.get('brand');
    if (devBrand) brandSlug = devBrand;
  }

  // Defense in depth: never treat a reserved subdomain as a brand even if a
  // misconfigured worker tells us to.
  if (brandSlug && RESERVED_SUBDOMAINS.has(brandSlug)) {
    brandSlug = null;
  }

  // ---- 2. Rewrite path into route group ----
  const path = url.pathname;
  const isAppHost = !brandSlug && isAppSurfaceHost(rawHost, effectiveHost);
  const isApiOrInternal =
    path.startsWith('/api/') ||
    path.startsWith('/_next/') ||
    path.startsWith('/favicon') ||
    /\.[a-z0-9]+$/i.test(path); // static files

  const res = NextResponse.next({
    request: {
      headers: new Headers(req.headers),
    },
  });

  if (!isApiOrInternal) {
    if (brandSlug) {
      res.headers.set('x-parygo-brand-slug', brandSlug);
      // Rewrite internally to /b/<slug>/<path>. Browser URL stays unchanged.
      // Folder uses a non-underscored prefix so Next.js routes it.
      const rewritten = new URL(req.url);
      rewritten.pathname = `/b/${brandSlug}${path === '/' ? '' : path}`;
      const rewriteRes = NextResponse.rewrite(rewritten, {
        request: { headers: new Headers(req.headers) },
      });
      rewriteRes.headers.set('x-parygo-brand-slug', brandSlug);
      if (sePuedeCachear(req, path)) {
        // 60s en el borde y 5 min de "serví lo viejo mientras revalidás": si el
        // Worker se satura, la gente igual ve la página en vez de un 503.
        rewriteRes.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        // El navegador NO la guarda (max-age=0): el que vuelve a entrar quiere
        // ver el cupo de ahora, y el que paga el costo es el borde, no él.
        rewriteRes.headers.set('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        // OJO con la llave de caché: el Worker de *.parygo.com reescribe el
        // Host al del proyecto de Pages, así que si algo cachea la subpetición
        // por URL sola, dos marcas con el MISMO slug de evento podrían pisarse.
        // Cloudflare solo respeta `Vary: Accept-Encoding`, así que un
        // `Vary: x-parygo-brand-slug` sería un amuleto, no una garantía: por
        // eso NO se pone. La caché de verdad va como Cache Rule de zona, donde
        // el host SÍ entra en la llave. Estas cabeceras son la condición
        // necesaria (sin ellas no cachea nada) y quedan verificadas midiendo
        // cf-cache-status en producción.

        // Sin cookies de sesión no hay nada que refrescar: saltearse
        // supabase.auth.getUser() ahorra un viaje de red POR PEDIDO, que es
        // justo lo que sobra cuando llegan miles a la vez.
        return rewriteRes;
      }
      return await refreshAuth(req, rewriteRes);
    }
    if (isAppHost) {
      // App host renders /(app)/... directly via route group; no rewrite needed
    }
  }

  return await refreshAuth(req, res);
}

async function refreshAuth(req: NextRequest, res: NextResponse): Promise<NextResponse> {
  // Sin cookie de sesión no hay nada que refrescar, y este atajo importa: la
  // llamada de abajo es un VIAJE DE RED a Supabase que se pagaba en CADA
  // pedido, incluido el POST del reclamo de una entrada gratis, donde nadie
  // está logueado. Medido contra producción: un reclamo hacía once viajes a la
  // base y tardaba 4,3s; este era uno de ellos.
  //
  // El comprador nunca tiene sesión (no se registra), así que en la noche del
  // evento esto se saltea para todo el mundo. El organizador y el super admin
  // sí traen cookie y siguen pasando por el refresco de siempre.
  if (!req.cookies.getAll().some((c) => c.name.startsWith('sb-'))) return res;

  // Without these calls Supabase auth cookies won't refresh, breaking Server Actions.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(toSet) {
          for (const { name, value, options } of toSet) {
            res.cookies.set(name, value, options);
          }
        },
      },
    }
  );
  // Renueva la cookie si el token venció. getSession() lo hace SIN viajar a
  // Supabase cuando el token sigue vigente; getUser() pagaba un viaje en CADA
  // pedido del panel (2026-09-25, medido: 1–1,8 s por pantalla). Acá no se
  // decide acceso: eso lo verifica getUser() en requireSession de cada página
  // y acción.
  await supabase.auth.getSession();
  return res;
}

export const config = {
  matcher: [
    // Skip Next internals + static files; everything else hits middleware.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|otf)$).*)',
  ],
};
