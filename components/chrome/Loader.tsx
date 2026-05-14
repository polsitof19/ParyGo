'use client';

import { useEffect, useState } from 'react';

const LETTERS = ['P', 'A', 'R', 'Y', 'G', 'O'] as const;

export function Loader() {
  const [show, setShow] = useState(false);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const seen = sessionStorage.getItem('pg5');
    if (seen) return;

    sessionStorage.setItem('pg5', '1');
    setShow(true);

    const t1 = window.setTimeout(() => setHide(true), 1100);
    const t2 = window.setTimeout(() => setShow(false), 2200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[300] grid place-items-center bg-bg"
      style={{
        clipPath: hide ? 'inset(0 0 100% 0)' : 'inset(0 0 0 0)',
        transition: 'clip-path 700ms cubic-bezier(0.65,0,0.35,1)',
        pointerEvents: hide ? 'none' : 'auto',
      }}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-7">
        <div className="font-display text-[36px] tracking-[0.01em] uppercase inline-flex items-baseline gap-[2px]">
          {LETTERS.map((letter, i) => (
            <span
              key={i}
              style={{
                opacity: 0,
                transform: 'translateY(20px)',
                display: 'inline-block',
                animation: `loaderLetter 600ms cubic-bezier(0.16,1,0.3,1) ${i * 50}ms forwards`,
              }}
            >
              {letter}
            </span>
          ))}
          <i
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: 'var(--magenta)',
              boxShadow: '0 0 12px var(--magenta)',
              marginLeft: '4px',
              opacity: 0,
              transform: 'scale(0.4)',
              display: 'inline-block',
              animation:
                'loaderDot 500ms 350ms cubic-bezier(0.34,1.56,0.64,1) forwards',
            }}
            aria-hidden="true"
          />
        </div>
        <span
          style={{
            width: '240px',
            height: '1px',
            background: 'var(--cyan)',
            boxShadow: '0 0 10px var(--cyan)',
            transformOrigin: 'center',
            transform: 'scaleX(0)',
            animation:
              'loaderLine 900ms 350ms cubic-bezier(0.16,1,0.3,1) forwards',
            display: 'block',
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
