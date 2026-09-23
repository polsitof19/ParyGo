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
      <span className="c-eyebrow c-state__dot c-state__dot--alert">No pudimos cargar</span>
      <h1 className="c-h1">Algo falló al cargar este evento</h1>
      <p className="c-muted">
        Reintenta en unos segundos. Si te quedaste a mitad de un pago, no se cobró: una compra recién queda confirmada cuando recibes el QR.
      </p>
      {error.digest && <p className="c-muted-3" style={{ marginTop: 'var(--b-sm)' }}>Ref: {error.digest}</p>}
      <button type="button" onClick={reset} className="c-btn c-btn--brand">Reintentar</button>
    </main>
  );
}
