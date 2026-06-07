'use client';

import { useEffect } from 'react';

// Single observer that drives all scroll reveals (replaces the v7 inline
// script). Adds `.in` to `.reveal`, `.reveal-stagger` and `.hero__title` as
// they enter; sets per-child `--i` on staggers. CSS does the rest. Respects
// prefers-reduced-motion (CSS forces everything visible there anyway).
export function RevealObserver() {
  useEffect(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>('.reveal, .reveal-stagger, .hero__title')
    );

    // index stagger children so CSS can delay each one
    document.querySelectorAll<HTMLElement>('.reveal-stagger').forEach((w) => {
      Array.from(w.children).forEach((c, i) =>
        (c as HTMLElement).style.setProperty('--i', String(i))
      );
    });

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.14, rootMargin: '0px 0px -6% 0px' }
    );
    els.forEach((el) => io.observe(el));

    // Fallbacks: anything near the top, or after a beat, reveals regardless.
    const fb1 = window.setTimeout(() => {
      els.forEach((el) => {
        if (!el.classList.contains('in') && el.getBoundingClientRect().top < window.innerHeight * 1.2) {
          el.classList.add('in');
        }
      });
    }, 1000);
    const fb2 = window.setTimeout(() => els.forEach((el) => el.classList.add('in')), 3600);

    return () => {
      io.disconnect();
      window.clearTimeout(fb1);
      window.clearTimeout(fb2);
    };
  }, []);

  return null;
}
