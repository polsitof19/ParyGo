'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, CalendarDays, House, LogOut, Store } from 'lucide-react';

// Las cuatro secciones del super admin (rediseño 2026-09-26): Inicio (lo que
// te toca y cómo va el negocio) · Marcas · Eventos · Salud. Solicitudes salió
// de la barra: el alta es autoservicio y queda un link al pie de Marcas.
// Mismo markup que el panel del organizador: barra LATERAL en la compu, barra
// de abajo en el celular (parygo-panel.css, "Navegación de los paneles").
const NAV = [
  { href: '/cabina-7k29x', label: 'Inicio', Icono: House },
  { href: '/cabina-7k29x/brands', label: 'Marcas', Icono: Store },
  { href: '/cabina-7k29x/events', label: 'Eventos', Icono: CalendarDays },
  { href: '/cabina-7k29x/salud', label: 'Salud', Icono: Activity },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/cabina-7k29x') return pathname === '/cabina-7k29x';
  // Solicitudes (sin pestaña) se lee como parte de Marcas.
  if (href === '/cabina-7k29x/brands') return pathname.startsWith(href) || pathname.startsWith('/cabina-7k29x/solicitudes');
  return pathname.startsWith(href);
}

export function SuperTopbar({ email }: { email: string }) {
  const pathname = usePathname() ?? '';

  const items = NAV.map(({ href, label, Icono }) => (
    <Link key={href} href={href} aria-current={isActive(pathname, href) ? 'page' : undefined}>
      <Icono className="s-nav__ico" aria-hidden="true" />
      <span>{label}</span>
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
