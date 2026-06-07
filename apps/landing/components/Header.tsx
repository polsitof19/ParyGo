'use client';

import { useEffect, useState } from 'react';
import { CTA } from '@/lib/cta';

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`header${scrolled ? ' scrolled' : ''}`} id="header">
      <div className="container header__inner">
        <a href="#top" className="logo" aria-label="ParyGo">
          parygo<span className="dot">.</span>
        </a>
        <nav className="nav" aria-label="primary">
          <a href="#como">Cómo funciona</a>
          <a href="#incluye">Qué incluye</a>
          <a href="#precios">Precios</a>
        </nav>
        <div className="header__cta">
          <a
            href={CTA.hero}
            className="btn btn-primary btn--sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            Empezar
          </a>
        </div>
      </div>
    </header>
  );
}
