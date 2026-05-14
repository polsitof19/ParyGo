'use client';

import { useEffect, useRef } from 'react';

export function ScrollProgress() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let queued = false;

    const update = () => {
      queued = false;
      const dh = document.documentElement.scrollHeight - window.innerHeight;
      const p = dh > 0 ? Math.min(1, window.scrollY / dh) : 0;
      el.style.transform = `scaleX(${p})`;
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 top-0 z-[199] h-[2px] origin-left"
      style={{
        background: 'var(--grad)',
        transform: 'scaleX(0)',
        transition: 'transform 100ms linear',
      }}
      aria-hidden="true"
    />
  );
}
