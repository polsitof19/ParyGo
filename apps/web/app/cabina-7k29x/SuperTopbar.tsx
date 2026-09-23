'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, CalendarDays, Inbox, LogOut, Store } from 'lucide-react';

// Las cuatro secciones del super admin. Mismo markup y misma navegación que el
// panel del organizador: barra LATERAL en la compu, barra de abajo en el
// celular (parygo-panel.css, "Navegación de los paneles").
const NAV = [
  { href: '/cabina-7k29x', label: 'Marcas', Icono: Store },
  { href: '/cabina-7k29x/events', label: 'Eventos', Icono: CalendarDays },
  { href: '/cabina-7k29x/solicitudes', label: 'Solicitudes', Icono: Inbox },
  { href: '/cabina-7k29x/salud', label: 'Salud', Icono: Activity },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/cabina-7k29x') return pathname === '/cabina-7k29x' || pathname.startsWith('/cabina-7k29x/brands');
  return pathname.startsWith(href);
}

export function SuperTopbar({ email, pendingRequests = 0 }: { email: string; pendingRequests?: number }) {
  const pathname = usePathname() ?? '';

  const items = NAV.map(({ href, label, Icono }) => (
    <Link key={href} href={href} aria-current={isActive(pathname, href) ? 'page' : undefined}>
      <Icono className="s-nav__ico" aria-hidden="true" />
      <span>{label}</span>
      {href === '/cabina-7k29x/solicitudes' && pendingRequests > 0 && (
        <span className="s-nav-count" aria-label={`${pendingRequests} pendientes`}>{pendingRequests}</span>
      )}
    </Link>
  ));

  return (
    <>
      <header className="s-topbar">
        <div className="s-topbar__inner">
          <Link href="/cabina-7k29x" className="s-logo s-logo--word">
            <span>parygo<span className="dot">.</span></span>
            <span className="tag">super</span>
          </Link>

          <nav className="s-nav" aria-label="Secciones">{items}</nav>

          <div className="s-topbar__right">
            <span className="s-email">{email}</span>
            <form action="/auth/logout" method="post">
              <button type="submit" aria-label="Cerrar sesión" className="s-iconbtn">
                <LogOut className="s-nav__ico" aria-hidden="true" />
                <span className="s-iconbtn__txt">Cerrar sesión</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Celular: las mismas cuatro, abajo. */}
      <nav className="s-tabbar" aria-label="Secciones">{items}</nav>
    </>
  );
}
