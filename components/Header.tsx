'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { CTA } from '@/lib/cta';

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
      className={cn(
        'fixed inset-x-0 top-0 z-50 grid items-center transition-all duration-[400ms]',
        'grid-cols-[1fr_auto_1fr] border-b border-transparent',
        scrolled
          ? 'bg-bg/[0.72] backdrop-blur-md backdrop-saturate-150 border-border py-3.5'
          : 'py-5'
      )}
      style={{ paddingLeft: 'var(--pad-x)', paddingRight: 'var(--pad-x)' }}
    >
      <Link href="#top" className="inline-flex items-center gap-2 text-[18px] font-medium -tracking-[0.03em]">
        <span>parygo</span>
        <span className="inline-block h-[6px] w-[6px] -translate-y-[1px] rounded-full bg-accent-terra" />
      </Link>

      <nav className="hidden justify-center gap-9 text-sm -tracking-[0.005em] md:flex">
        <Link href="#plataforma" className="link-u text-fg-muted transition-colors hover:text-fg">
          plataforma
        </Link>
        <Link href="#packs" className="link-u text-fg-muted transition-colors hover:text-fg">
          packs
        </Link>
        <Link href="#proceso" className="link-u text-fg-muted transition-colors hover:text-fg">
          cómo funciona
        </Link>
        <Link href="#contacto" className="link-u text-fg-muted transition-colors hover:text-fg">
          contacto
        </Link>
      </nav>

      <a
        href={CTA.hero}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'justify-self-end inline-flex items-center gap-2 rounded-full border border-border px-[18px] py-2.5 text-sm',
          'transition-colors duration-[400ms] hover:bg-fg hover:text-bg hover:border-fg'
        )}
      >
        empezar <span className="arrow">→</span>
      </a>
    </header>
  );
}
