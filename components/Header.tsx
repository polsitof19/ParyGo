'use client';

import { useEffect, useState } from 'react';
import { CTA } from '@/lib/cta';

const NAV = [
  { href: '#servicio', label: 'Servicio' },
  { href: '#demo', label: 'Demo' },
  { href: '#precios', label: 'Precios' },
  { href: '#contacto', label: 'Contacto' },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="fixed inset-x-0 top-0 z-[90] flex items-center"
      style={{
        height: 68,
        background: scrolled ? 'rgba(5,5,8,0.8)' : 'transparent',
        backdropFilter: scrolled ? 'saturate(170%) blur(20px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'saturate(170%) blur(20px)' : 'none',
        borderBottom: scrolled
          ? '1px solid var(--border)'
          : '1px solid transparent',
        transition:
          'background-color 280ms ease, border-color 280ms ease, backdrop-filter 280ms ease',
      }}
    >
      <div
        className="wrap grid w-full items-center gap-4"
        style={{ gridTemplateColumns: '1fr auto 1fr' }}
      >
        <div className="flex items-center gap-[18px]">
          <a
            href="#top"
            aria-label="ParyGo"
            className="font-display text-[22px] uppercase tracking-[0.01em] text-fg inline-flex items-center gap-1.5"
          >
            <span>PARYGO</span>
            <span
              className="inline-block w-[7px] h-[7px] rounded-full bg-magenta animate-pulse-m"
              style={{ boxShadow: '0 0 10px var(--magenta)' }}
              aria-hidden="true"
            />
          </a>
          <span className="hidden md:inline-flex items-center gap-2 mono normal-case tracking-[0.18em] text-green text-[10px]">
            <span className="pg-dot" />
            LIVE
          </span>
        </div>

        <nav
          className="hidden md:flex items-center gap-1.5 mono"
          aria-label="primary"
          style={{ fontSize: 12, letterSpacing: '0.18em', color: 'var(--fg-2)' }}
        >
          {NAV.map((item, i) => (
            <span key={item.href} className="contents">
              <a
                href={item.href}
                data-cursor="hover"
                className="relative px-3.5 py-1.5 transition-colors hover:text-fg"
                style={{ color: 'var(--fg-2)' }}
              >
                {item.label}
                <span
                  className="pointer-events-none absolute left-[14px] right-[14px] bottom-[2px] h-px origin-left scale-x-0 transition-transform duration-[400ms] hover-line"
                  style={{ background: 'var(--fg)' }}
                />
              </a>
              {i < NAV.length - 1 && (
                <span className="text-fg-3" aria-hidden="true">
                  ·
                </span>
              )}
            </span>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-3.5">
          <a
            href={CTA.hero}
            target="_blank"
            rel="noopener noreferrer"
            data-cursor="hover"
            className="btn btn-grad btn-sm"
          >
            Empezar <span className="arrow">→</span>
          </a>
        </div>
      </div>

      <style>{`
        header nav a:hover .hover-line { transform: scaleX(1); }
      `}</style>
    </header>
  );
}
