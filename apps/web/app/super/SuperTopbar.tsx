'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';

const NAV = [
  { href: '/super', label: 'Marcas' },
  { href: '/super/events', label: 'Eventos' },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/super') return pathname === '/super' || pathname.startsWith('/super/brands');
  return pathname.startsWith(href);
}

export function SuperTopbar({ email, yapeCount }: { email: string; yapeCount: number }) {
  const pathname = usePathname() ?? '';

  return (
    <header className="s-topbar">
      <div className="s-topbar__inner">
        <Link href="/super" className="s-logo">
          parygo<span className="dot">.</span>
          <span className="tag">Super</span>
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
          <Link href="/super/yape" className="s-support-link" aria-current={pathname.startsWith('/super/yape') ? 'page' : undefined}>
            Yape pendientes
            {yapeCount > 0 && <span className="count">{yapeCount}</span>}
          </Link>
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
