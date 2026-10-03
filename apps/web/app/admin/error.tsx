'use client';

import { useEffect } from 'react';
import { useTextos } from '@/components/IdiomaPanel';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTextos();
  useEffect(() => {
    console.error('brand admin error:', error);
  }, [error]);
  return (
    <div className="s-card s-card--lg" style={{ maxWidth: 520, marginTop: 40 }}>
      <h1 className="s-h1" style={{ marginTop: 8 }}>{t('No pudimos cargar tu panel', 'We could not load your dashboard')}</h1>
      <p className="s-card__desc" style={{ marginTop: 8 }}>{t('Reintenta. Si sigue, contacta a soporte ParyGo.', 'Try again. If it keeps happening, contact ParyGo support.')}</p>
      {error.digest && <p className="s-hint" style={{ marginTop: 10 }}>{t('Ref:', 'Ref:')} {error.digest}</p>}
      <div style={{ marginTop: 20 }}>
        <button type="button" onClick={reset} className="s-btn s-btn--primary">{t('Reintentar', 'Retry')}</button>
      </div>
    </div>
  );
}
