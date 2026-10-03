'use client';

import { useEffect, useRef } from 'react';
import { Reveal } from './Reveal';

export type Word =
  | { t: string; italic?: boolean; br?: never }
  | { br: true; t?: never; italic?: never };

type SplitWordsProps = {
  words: Word[];
  className?: string;
  as?: 'h1' | 'h2' | 'h3';
};

// Renders an h1/h2 with each word individually wrapped so the parent .in flag
// can drive a per-word reveal via CSS (defined in globals.css under
// `.split-word`). Italic words render in serif gradient.
export function SplitWords({ words, className, as = 'h2' }: SplitWordsProps) {
  const ref = useRef<HTMLElement | null>(null);

  // Reveal lives at the heading element so .reveal-words.in toggles correctly.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -5% 0px' }
    );
    io.observe(el);
    const fb = window.setTimeout(() => el.classList.add('in'), 3800);
    return () => {
      io.disconnect();
      window.clearTimeout(fb);
    };
  }, []);

  const Tag = as;

  return (
    <Tag
      ref={ref as never}
      className={`reveal-words ${className ?? ''}`}
    >
      {words.map((w, i) => {
        if (w.br) return <br key={`br-${i}`} />;
        return (
          <span
            key={i}
            className={`split-word${w.italic ? ' italic-target' : ''}`}
          >
            <span style={{ transitionDelay: `${i * 80}ms` }}>
              {w.italic ? <span className="serif-grad">{w.t}</span> : w.t}
            </span>
          </span>
        );
      })}
    </Tag>
  );
}

// Re-export Reveal here as a convenience to keep imports cohesive.
export { Reveal };
