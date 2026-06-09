'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Refresco automático del apartado (RSC re-fetch sin recarga, sin perder scroll).
// Pausa cuando la pestaña está oculta. Para puerta/Yape en tiempo casi-real.
export function LiveRefresh({ seconds = 12 }: { seconds?: number }) {
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
    <button type="button" className="a-live" onClick={() => setOn((v) => !v)} title={on ? 'Pausar refresco' : 'Reanudar refresco'}>
      <span className="a-live__dot" style={on ? undefined : { background: 'var(--ink-3)', animation: 'none' }} />
      {on ? `En vivo · cada ${seconds}s` : 'Refresco pausado'}
    </button>
  );
}
