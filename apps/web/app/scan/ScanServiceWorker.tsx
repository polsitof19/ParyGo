'use client';

import { useEffect } from 'react';

// Registra el Service Worker de la puerta. Se monta SOLO en /scan, así los
// compradores nunca lo registran. El SW arranca la app offline tras recarga.
export function ScanServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/scan-sw.js').catch((e) => {
      console.warn('[scan-sw] registro falló', e);
    });
  }, []);
  return null;
}
