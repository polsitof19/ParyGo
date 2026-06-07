'use client';

import { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('brand admin error:', error);
  }, [error]);
  return (
    <div className="s-card s-card--lg" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
      <span className="eyebrow" style={{ color: 'var(--alert)' }}>Error</span>
      <h1 className="s-h1" style={{ marginTop: 8 }}>No pudimos cargar tu panel</h1>
      <p className="s-card__desc" style={{ marginTop: 8 }}>Reintentá. Si sigue, contactá a soporte ParyGo.</p>
      {error.digest && <p className="s-hint" style={{ marginTop: 10 }}>Ref: {error.digest}</p>}
      <div style={{ marginTop: 20 }}>
        <button type="button" onClick={reset} className="s-btn s-btn--primary">Reintentar</button>
      </div>
    </div>
  );
}
