'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type TiltProps = {
  children: ReactNode;
  className?: string;
  max?: number;
  as?: 'article' | 'div';
};

export function Tilt({ children, className, max = 4, as = 'article' }: TiltProps) {
  const Tag = as as 'article';
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (reduced || !fine) return;

    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const onMove = (ev: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const cx = ev.clientX - r.left;
      const cy = ev.clientY - r.top;
      const px = cx / r.width - 0.5;
      const py = cy / r.height - 0.5;
      el.style.setProperty('--mx', cx + 'px');
      el.style.setProperty('--my', cy + 'px');
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `perspective(900px) rotateY(${px * max}deg) rotateX(${-py * max}deg)`;
      });
    };
    const onLeave = () => {
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = '';
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [max]);

  return (
    <Tag
      ref={ref as never}
      data-tilt
      className={className}
      style={{ transformStyle: 'preserve-3d', transition: 'transform 400ms cubic-bezier(0.16,1,0.3,1), border-color 280ms ease, background-color 280ms ease' }}
    >
      {children}
    </Tag>
  );
}
