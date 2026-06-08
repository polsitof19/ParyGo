/* ============================================================
   ParyGo · Service Worker de la PUERTA (offline shell de /scan)
   ------------------------------------------------------------
   Objetivo: que la app de escaneo LEVANTE sin red tras recarga/cierre.
   El cache de TICKETS y la cola de sync viven en IndexedDB (no acá); este SW
   solo cachea el "app shell" (HTML de /scan + chunks JS/CSS) para que la app
   arranque offline.

   Scope: se registra desde /scan SOLAMENTE (los compradores nunca lo registran).
   El handler de fetch es ESTRICTAMENTE selectivo:
     - assets inmutables (/_next/static, fuentes) → cache-first
     - navegaciones a /scan → network-first con fallback a cache
     - TODO lo demás → passthrough (no respondWith) → red normal
   Así no interfiere con la compra del cliente, los paneles, APIs ni server
   actions (POST nunca se intercepta).
   ============================================================ */
const CACHE = 'parygo-scan-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/scan').catch(() => {})));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('parygo-scan-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/_next/image') ||
    /\.(woff2?|ttf|otf|png|jpg|jpeg|webp|svg|ico|css|js)$/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // nunca tocar POST (server actions, etc.)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // solo mismo origen

  // 1. Assets inmutables (hasheados) → cache-first. Seguro a nivel origen:
  //    acelera todo y no rompe nada (los hash cambian por deploy).
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && res.ok && res.status === 200) cache.put(req, res.clone());
          return res;
        } catch (e) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // 2. Navegaciones a /scan → network-first, fallback a cache (offline reload).
  if (req.mode === 'navigate' && url.pathname.startsWith('/scan')) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const cache = await caches.open(CACHE);
            cache.put('/scan', res.clone());
          }
          return res;
        } catch (e) {
          const cache = await caches.open(CACHE);
          return (await cache.match('/scan')) || (await cache.match(req)) || Response.error();
        }
      })()
    );
    return;
  }

  // 3. Todo lo demás → passthrough (no respondWith) → red normal.
});
