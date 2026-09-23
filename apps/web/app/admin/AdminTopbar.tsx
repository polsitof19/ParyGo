'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, LogOut, ScanLine, Store, Users } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';

// Las CUATRO secciones del panel, las mismas en celular y computadora:
//   Eventos   la lista, cada evento y crear uno nuevo
//   Escáner   la puerta (abre /scan; desde ahí "Panel" vuelve acá)
//   Equipo    quién escanea en la puerta
//   Mi marca  datos, cobro (Yape / tarjeta) y logo
// En computadora van arriba, en texto con subrayado. En el celular van ABAJO,
// fijas, con ícono y nombre: el pulgar llega y siempre se sabe dónde se está.
const NAV = [
  { href: '/admin', label: 'Eventos', Icono: CalendarDays },
  { href: '/scan', label: 'Escáner', Icono: ScanLine },
  { href: '/admin/equipo', label: 'Equipo', Icono: Users },
  { href: '/admin/settings', label: 'Mi marca', Icono: Store },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin' || pathname.startsWith('/admin/events');
  return pathname.startsWith(href);
}

export function AdminTopbar({ brandName, email, logoUrl, soloLectura = false }: { brandName: string; email: string; logoUrl?: string | null; soloLectura?: boolean }) {
  const pathname = usePathname() ?? '';

  // El super admin que MIRA una marca (solo lectura) no tiene puerta que abrir:
  // el escáner es de la marca y lo rebotaría a su cabina.
  const items = NAV.filter(({ href }) => !(soloLectura && href === '/scan')).map(({ href, label, Icono }) => (
    <Link key={href} href={href} aria-current={isActive(pathname, href) ? 'page' : undefined}>
      <Icono className="s-nav__ico" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  ));

  return (
    <>
      <header className="s-topbar">
        <div className="s-topbar__inner">
          {/* El que se recorta con "…" es el NOMBRE, no el lockup entero. */}
          <Link href="/admin" className="s-logo" style={{ gap: 10 }}>
            {logoUrl && <BrandLogo src={logoUrl} alt="" size={28} ring={false} />}
            <span className="s-logo__name">{brandName}</span>
            <span className="dot">.</span>
            <span className="tag">Tu panel</span>
          </Link>

          <nav className="s-nav" aria-label="Secciones">{items}</nav>

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

      {/* Celular: las mismas cuatro, abajo. */}
      <nav className="s-tabbar" aria-label="Secciones">{items}</nav>
    </>
  );
}
