'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';

const NAV = [
  { href: '/admin', label: 'Inicio' },
  { href: '/admin/settings', label: 'Configuración' },
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
              {item.label}
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
