'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTextos } from '@/components/IdiomaPanel';

// Refresco automático del apartado (RSC re-fetch sin recarga, sin perder scroll).
// Pausa cuando la pestaña está oculta. Para puerta/Yape en tiempo casi-real.
export function LiveRefresh({ seconds = 12 }: { seconds?: number }) {
  const { t } = useTextos();
  const router = useRouter();
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds, on]);
  return (
    <button type="button" className="a-live" onClick={() => setOn((v) => !v)} title={on ? t('Pausar refresco', 'Pause refresh') : t('Reanudar refresco', 'Resume refresh')}>
      <span className="a-live__dot" style={on ? undefined : { background: 'var(--ink-3)', animation: 'none' }} />
      {on ? t(`En vivo · cada ${seconds}s`, `Live · every ${seconds}s`) : t('Refresco pausado', 'Refresh paused')}
    </button>
  );
}
