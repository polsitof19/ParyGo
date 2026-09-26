'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type GiantParallaxProps = {
  children: ReactNode;
  className?: string;
  amount?: number;
};

export function GiantParallax({
  children,
  className,
  amount = 28,
}: GiantParallaxProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const el = ref.current;
    if (!el) return;

    let queued = false;
    const update = () => {
      queued = false;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      const center = r.top + r.height / 2;
      const off = (center - window.innerHeight / 2) / window.innerHeight;
      el.style.transform = `translateY(${off * amount}px)`;
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [amount]);

  return (
    <div ref={ref} className={className} style={{ willChange: 'transform' }}>
      {children}
    </div>
  );
}
