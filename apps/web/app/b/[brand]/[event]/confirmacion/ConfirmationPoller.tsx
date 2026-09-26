'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Lightweight client poller that replaces the previous <meta http-equiv="refresh">.
// Server stays as RSC; this just re-fetches via router.refresh() so the order
// status check re-runs without a full page reload (no scroll loss, no flash).
// Se PAUSA cuando la pestaña está oculta (móvil en segundo plano) y tiene un
// TOPE de intentos para no machacar el edge indefinidamente. Al llegar al tope
// muestra un estado terminal (en vez de spinner infinito) para que el comprador
// con plata en juego sepa qué hacer.
export function ConfirmationPoller({ intervalMs = 5000, maxTicks = 180 }: { intervalMs?: number; maxTicks?: number }) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    let ticks = 0;
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return; // pausa en background
      ticks += 1;
      if (ticks > maxTicks) { clearInterval(id); setGaveUp(true); return; } // tope (~15 min)
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, maxTicks]);

  if (!gaveUp) return null;
  return (
    <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--cream-2)', border: '1px solid var(--cream-3)', borderRadius: 12, maxWidth: 420 }}>
      <p style={{ fontWeight: 700, fontSize: 14 }}>Esto está tardando más de lo normal</p>
      <p className="c-muted" style={{ fontSize: 13, marginTop: 4 }}>
        Tu pago puede seguir procesándose. Si se aprueba, te llega tu entrada por email automáticamente. Si no lo recibes en un rato, escríbenos.
      </p>
    </div>
  );
}
