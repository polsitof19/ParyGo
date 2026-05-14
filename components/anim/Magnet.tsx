'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type MagnetProps = {
  children: ReactNode;
  strength?: number;
  className?: string;
};

export function Magnet({ children, strength = 0.3, className }: MagnetProps) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (reduced || !fine) return;

    const el = ref.current;
    if (!el) return;

    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;

    const loop = () => {
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      el.style.transform = `translate(${cx}px, ${cy}px)`;
      if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = 0;
      }
    };

    const onMove = (ev: MouseEvent) => {
      const r = el.getBoundingClientRect();
      tx = (ev.clientX - r.left - r.width / 2) * strength;
      ty = (ev.clientY - r.top - r.height / 2) * strength;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      if (!raf) raf = requestAnimationFrame(loop);
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [strength]);

  return (
    <span
      ref={ref}
      className={`magnet inline-block ${className ?? ''}`}
      style={{ willChange: 'transform' }}
    >
      {children}
    </span>
  );
}
