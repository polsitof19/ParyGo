'use client';

import { useEffect, useRef, useState } from 'react';

const HOVER_SEL =
  'a, button, [data-cursor="hover"], .magnet, [data-tilt], .browser';
const BIG_SEL = '[data-cursor-big], [data-tilt], .browser';

export function Cursor() {
  const [enabled, setEnabled] = useState(false);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pointerFine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (reduced || !pointerFine) return;
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let rx = mx;
    let ry = my;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
    };
    document.addEventListener('mousemove', onMove);

    const tick = () => {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      dot.style.transform = `translate(${mx}px, ${my}px)`;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onOver = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const hovered = target.closest(HOVER_SEL);
      if (hovered) {
        ring.classList.add('pg-cursor-hover');
        if (hovered.closest(BIG_SEL)) ring.classList.add('pg-cursor-big');
        else ring.classList.remove('pg-cursor-big');
      }
    };
    const onOut = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest(HOVER_SEL)) {
        ring.classList.remove('pg-cursor-hover');
        ring.classList.remove('pg-cursor-big');
      }
    };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div
        ref={dotRef}
        className="fixed top-0 left-0 z-[250] pointer-events-none rounded-full"
        style={{
          width: 8,
          height: 8,
          background: '#fff',
          margin: '-4px 0 0 -4px',
          mixBlendMode: 'difference',
          willChange: 'transform',
        }}
        aria-hidden="true"
      />
      <div
        ref={ringRef}
        className="fixed top-0 left-0 z-[250] pointer-events-none rounded-full"
        style={{
          width: 40,
          height: 40,
          border: '1px solid #fff',
          margin: '-20px 0 0 -20px',
          mixBlendMode: 'difference',
          willChange: 'transform',
          opacity: 0,
          transform: 'scale(0.5)',
          transition:
            'opacity 200ms ease, transform 200ms ease, width 240ms ease, height 240ms ease, margin 240ms ease, background 240ms ease, border-color 240ms ease',
        }}
        aria-hidden="true"
      />
      <style>{`
        .pg-cursor-hover { opacity: 1 !important; transform: scale(1) !important; }
        .pg-cursor-big {
          width: 64px !important; height: 64px !important;
          margin: -32px 0 0 -32px !important;
          background: rgba(255,31,143,0.16) !important;
          border-color: var(--magenta) !important;
        }
      `}</style>
    </>
  );
}
