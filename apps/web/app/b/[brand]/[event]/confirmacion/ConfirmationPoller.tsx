'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Lightweight client poller that replaces the previous <meta http-equiv="refresh">.
// Server stays as RSC; this just re-fetches via router.refresh() so the order
// status check re-runs without a full page reload (no scroll loss, no flash).
// Se PAUSA cuando la pestaña está oculta (móvil en segundo plano) y tiene un
// TOPE de intentos para no machacar el edge indefinidamente.
export function ConfirmationPoller({ intervalMs = 5000, maxTicks = 180 }: { intervalMs?: number; maxTicks?: number }) {
  const router = useRouter();
  useEffect(() => {
    let ticks = 0;
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return; // pausa en background
      ticks += 1;
      if (ticks > maxTicks) { clearInterval(id); return; } // tope (~15 min)
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, maxTicks]);
  return null;
}
