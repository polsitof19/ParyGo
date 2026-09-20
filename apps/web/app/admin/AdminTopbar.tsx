'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';

// `short` es la etiqueta de teléfono angosto: los tres ítems tienen que entrar
// sin deslizar en 390px (ver parygo-panel.css, @media 460px).
const NAV = [
  { href: '/admin', label: 'Inicio', short: 'Inicio' },
  { href: '/admin/settings', label: 'Configuración', short: 'Config' },
  { href: '/admin/equipo', label: 'Equipo', short: 'Equipo' },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin' || pathname.startsWith('/admin/events');
  return pathname.startsWith(href);
}

export function AdminTopbar({ brandName, email, logoUrl }: { brandName: string; email: string; logoUrl?: string | null }) {
  const pathname = usePathname() ?? '';

  return (
    <header className="s-topbar">
      <div className="s-topbar__inner">
        <Link href="/admin" className="s-logo" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {logoUrl && <BrandLogo src={logoUrl} alt="" size={28} ring={false} />}
          {brandName}
          <span className="dot">.</span>
          <span className="tag">Tu panel</span>
        </Link>

        <nav className="s-nav" aria-label="Secciones">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            >
              <span className="s-nav__long">{item.label}</span>
              <span className="s-nav__short">{item.short}</span>
            </Link>
          ))}
        </nav>

        <div className="s-topbar__right">
          <span className="s-email">{email}</span>
          <form action="/auth/logout" method="post">
            <button type="submit" aria-label="Cerrar sesión" className="s-iconbtn">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
