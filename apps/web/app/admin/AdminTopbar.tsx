'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, LogOut, ScanLine, Store, Users } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { useTextos } from '@/components/IdiomaPanel';
import type { Textos } from '@/lib/idioma';

// Las CUATRO secciones del panel, las mismas en celular y computadora:
//   Eventos   la lista, cada evento y crear uno nuevo
//   Escáner   la puerta (abre /scan; desde ahí "Panel" vuelve acá)
//   Equipo    quién escanea en la puerta
//   Mi marca  datos, cobro (Yape / tarjeta) y logo
// En la computadora van en la barra LATERAL; en el celular, ABAJO y fijas,
// con ícono y nombre (parygo-panel.css, "Navegación de los paneles").
const nav = (t: Textos['t']) =>
  [
    { href: '/admin', label: t('Eventos', 'Events'), Icono: CalendarDays },
    { href: '/scan', label: t('Escáner', 'Scanner'), Icono: ScanLine },
    { href: '/admin/equipo', label: t('Equipo', 'Team'), Icono: Users },
    { href: '/admin/settings', label: t('Mi marca', 'My brand'), Icono: Store },
  ] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin' || pathname.startsWith('/admin/events');
  return pathname.startsWith(href);
}

export function AdminTopbar({ brandName, email, logoUrl, soloLectura = false }: { brandName: string; email: string; logoUrl?: string | null; soloLectura?: boolean }) {
  const pathname = usePathname() ?? '';
  const { t } = useTextos();

  // El super admin que MIRA una marca (solo lectura) no tiene puerta que abrir:
  // el escáner es de la marca y lo rebotaría a su cabina.
  const items = nav(t).filter(({ href }) => !(soloLectura && href === '/scan')).map(({ href, label, Icono }) => (
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
          <Link href="/admin" className="s-logo">
            {logoUrl && <BrandLogo src={logoUrl} alt="" size={30} ring={false} />}
            <span className="s-logo__name">{brandName}</span>
          </Link>

          <nav className="s-nav" aria-label={t('Secciones', 'Sections')}>{items}</nav>

          <div className="s-topbar__right">
            <span className="s-email">{email}</span>
            <form action="/auth/logout" method="post">
              <button type="submit" aria-label={t('Cerrar sesión', 'Log out')} className="s-iconbtn">
                <LogOut className="s-nav__ico" aria-hidden="true" />
                <span className="s-iconbtn__txt">{t('Cerrar sesión', 'Log out')}</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Celular: las mismas cuatro, abajo. */}
      <nav className="s-tabbar" aria-label={t('Secciones', 'Sections')}>{items}</nav>
    </>
  );
}
