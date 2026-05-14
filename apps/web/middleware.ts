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
      return await refreshAuth(req, rewriteRes);
    }
    if (isAppHost) {
      // App host renders /(app)/... directly via route group; no rewrite needed
    }
  }

  return await refreshAuth(req, res);
}

async function refreshAuth(req: NextRequest, res: NextResponse): Promise<NextResponse> {
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
  // Touch the session so Supabase rotates the cookie if needed.
  await supabase.auth.getUser();
  return res;
}

export const config = {
  matcher: [
    // Skip Next internals + static files; everything else hits middleware.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|otf)$).*)',
  ],
};
