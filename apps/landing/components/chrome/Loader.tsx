'use client';

import { useEffect, useState } from 'react';

// Short, elegant opening intro in the v7 style (cream + tangerine + Bricolage).
// ~1.2s max, then reveals the site. Respects prefers-reduced-motion (no intro)
// and only plays once per browser session. It's a fixed overlay — the page
// renders underneath, so it never blocks the actual content/load on mobile.
export function Loader() {
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('in');

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let seen = false;
    try {
      seen = window.sessionStorage.getItem('pg_v7_intro') === '1';
    } catch {
      /* sessionStorage blocked → treat as not seen */
    }
    if (reduced || seen) {
      setPhase('gone');
      return;
    }
    try {
      window.sessionStorage.setItem('pg_v7_intro', '1');
    } catch {
      /* ignore */
    }
    const tOut = window.setTimeout(() => setPhase('out'), 850);
    const tGone = window.setTimeout(() => setPhase('gone'), 1200);
    return () => {
      window.clearTimeout(tOut);
      window.clearTimeout(tGone);
    };
  }, []);

  if (phase === 'gone') return null;

  return (
    <div className={`intro intro--${phase}`} aria-hidden="true">
      <div className="intro__mark">
        <span className="intro__logo">
          parygo<span className="dot">.</span>
        </span>
        <span className="intro__bar" />
      </div>
    </div>
  );
}
