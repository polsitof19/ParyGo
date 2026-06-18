'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';

const NAV = [
  { href: '/cabina-7k29x', label: 'Marcas' },
  { href: '/cabina-7k29x/events', label: 'Eventos' },
  { href: '/cabina-7k29x/solicitudes', label: 'Solicitudes' },
  { href: '/cabina-7k29x/salud', label: 'Salud' },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/cabina-7k29x') return pathname === '/cabina-7k29x' || pathname.startsWith('/cabina-7k29x/brands');
  return pathname.startsWith(href);
}

export function SuperTopbar({ email, pendingRequests = 0 }: { email: string; pendingRequests?: number }) {
  const pathname = usePathname() ?? '';

  return (
    <header className="s-topbar">
      <div className="s-topbar__inner">
        <Link href="/cabina-7k29x" className="s-logo">
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
              {item.href === '/cabina-7k29x/solicitudes' && pendingRequests > 0 && (
                <span className="s-nav-count" aria-label={`${pendingRequests} pendientes`}>{pendingRequests}</span>
              )}
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
