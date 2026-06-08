'use client';

import { useEffect } from 'react';

export default function BrandError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('brand site error:', error);
  }, [error]);
  return (
    <main className="c-state">
      <span className="c-eyebrow" style={{ color: 'var(--alert)' }}>No pudimos cargar</span>
      <h1 className="c-h1" style={{ fontSize: 30, marginTop: 8 }}>Algo falló al cargar este evento</h1>
      <p className="c-muted" style={{ marginTop: 10 }}>
        Reintentá en unos segundos. Si te quedaste a mitad de un pago, no se cobró: una compra recién queda confirmada cuando recibís el QR.
      </p>
      {error.digest && <p className="c-muted-3" style={{ fontSize: 12, marginTop: 10 }}>Ref: {error.digest}</p>}
      <div style={{ marginTop: 20 }}>
        <button type="button" onClick={reset} className="c-btn c-btn--brand">Reintentar</button>
      </div>
    </main>
  );
}
