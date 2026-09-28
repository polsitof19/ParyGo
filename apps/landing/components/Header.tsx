'use client';

import { useEffect, useState } from 'react';
import { empezar } from '@/lib/cta';
import type { Dict } from '@/lib/i18n';
import { SITE } from '@/lib/site';
import { Idioma } from '@/components/Idioma';

export function Header({ t }: { t: Dict }) {
  const [scrolled, setScrolled] = useState(false);
  const h = t.header;

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
          <a href="#como">{h.nav[0]}</a>
          <a href="#seguridad">{h.nav[1]}</a>
          <a href="#precios">{h.nav[2]}</a>
          <a href="#preguntas">{h.nav[3]}</a>
        </nav>
        <div className="header__cta">
          <Idioma lang={t.lang} label={t.idioma.label} className="idioma--header" />
          <a href={SITE.loginUrl} className="btn btn-soft btn--sm header__login" aria-label={h.loginAria}>
            <svg className="header__login-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" x2="3" y1="12" y2="12" />
            </svg>
            {h.login}
          </a>
          <a href={empezar(t.lang)} className="btn btn-primary btn--sm">{h.cta}</a>
        </div>
      </div>
    </header>
  );
}
