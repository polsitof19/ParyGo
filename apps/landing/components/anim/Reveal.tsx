'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type Variant = 'reveal' | 'reveal-words' | 'reveal-stagger';

type RevealProps = {
  children: ReactNode;
  variant?: Variant;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'span' | 'p' | 'ul' | 'h2';
};

// Adds .in once the element enters the viewport. CSS handles the actual
// transition — keeping JS tiny. SplitWords is rendered as children when
// variant === "reveal-words"; the parent supplies the .in flag.
export function Reveal({
  children,
  variant = 'reveal',
  className,
  as = 'div',
}: RevealProps) {
  const Tag = as as 'div';
  const ref = useRef<HTMLDivElement | null>(null);

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

    // Fallback: if past viewport when JS lands, reveal anyway.
    const fb = window.setTimeout(() => {
      if (!el.classList.contains('in')) {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 1.2) el.classList.add('in');
      }
    }, 1100);
    const fb2 = window.setTimeout(() => el.classList.add('in'), 3800);

    return () => {
      io.disconnect();
      window.clearTimeout(fb);
      window.clearTimeout(fb2);
    };
  }, []);

  return (
    <Tag ref={ref} className={`${variant} ${className ?? ''}`}>
      {children}
    </Tag>
  );
}
