'use client';

import { useEffect, useState } from 'react';
import { CTA } from '@/lib/cta';
import { SITE } from '@/lib/site';

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
          <span className="header__login-hint" aria-hidden="true">
            ¿Organizás eventos?
          </span>
          <a
            href={SITE.loginUrl}
            className="btn btn-soft btn--sm header__login"
            aria-label="Ingresar al panel de organizadores"
          >
            <svg
              className="header__login-ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" x2="3" y1="12" y2="12" />
            </svg>
            Ingresar
          </a>
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
