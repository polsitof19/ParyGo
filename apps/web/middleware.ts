import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// =============================================================
// Multi-tenant subdomain router + Supabase auth cookie refresh
// =============================================================
// Hosts we handle:
//   - app.parygo.com         → super admin + auth pages (default app surface)
//   - <slug>.parygo.com      → brand-scoped public site (event pages, /t/[uuid])
//   - localhost:3001         → dev convenience: query param ?brand=code
//
// Strategy:
//   1. Resolve subdomain → set x-parygo-brand-slug header (consumed by RSC)
//   2. Rewrite path:
//        - app.* and apex  → /(app)/<orig path>
//        - brand subdomain → /(brand)/<orig path>
//   3. Call Supabase SSR to refresh cookies (mandatory for Server Actions)
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
  // Local dev override via query param handled in handler
  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1') return null;
  const parts = cleanHost.split('.');
  // parygo.com → no subdomain
  if (parts.length < 3) return null;
  const sub = parts[0]!;
  if (RESERVED_SUBDOMAINS.has(sub)) return null;
  return sub;
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const cleanHost = host.split(':')[0]?.toLowerCase() ?? '';
  const url = req.nextUrl.clone();

  // ---- 1. Resolve brand slug ----
  let brandSlug: string | null = extractSubdomain(host);

  // Dev convenience: ?brand=code on localhost lets us test brand routing
  if (!brandSlug && (cleanHost === 'localhost' || cleanHost === '127.0.0.1')) {
    const devBrand = url.searchParams.get('brand');
    if (devBrand) brandSlug = devBrand;
  }

  // ---- 2. Rewrite path into route group ----
  const path = url.pathname;
  const isAppHost = APP_HOSTS.has(host.toLowerCase()) && !brandSlug;
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
      // Rewrite to (brand) route group, prefixing path with brand slug
      const rewritten = new URL(req.url);
      rewritten.pathname = `/_brand/${brandSlug}${path === '/' ? '' : path}`;
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
