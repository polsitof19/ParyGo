'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Navegación del evento en 4 GRUPOS (antes: 8 pestañas planas al mismo nivel,
// con pares confusos como "Editar evento"/"Editar entradas" y "Accesos", que
// sonaba a permisos pero era el monitor de la puerta). Ver
// design_handoff_refresco_paneles/INSPECCION-panel-organizador-y-entrada.md.
// Las URLs no cambian (bookmarks y links viejos siguen andando): /accesos es
// "En la puerta".
const GROUPS = [
  {
    label: 'Mi evento',
    items: [
      { seg: '', label: 'Resumen' },
      { seg: '/editar', label: 'Editar' },
      { seg: '/entradas', label: 'Entradas' },
    ],
  },
  {
    label: 'Ventas y pagos',
    items: [
      { seg: '/yape', label: 'Revisar Yape' },
      { seg: '/clientes', label: 'Compradores' },
      { seg: '/promotores', label: 'Promotores' },
      { seg: '/cortesias', label: 'Cortesías' },
    ],
  },
  {
    label: 'Puerta y equipo',
    items: [
      { seg: '/accesos', label: 'En la puerta' },
      { seg: '/equipo', label: 'Equipo' },
    ],
  },
  {
    label: 'Cierre',
    items: [{ seg: '/reporte', label: 'Reporte' }],
  },
] as const;

export function EventTabs({ eventId, yapePending }: { eventId: string; yapePending: number }) {
  const path = usePathname();
  const base = `/admin/events/${eventId}`;
  return (
    <nav className="a-nav" aria-label="Secciones del evento">
      {GROUPS.map((g) => (
        <div key={g.label} className="a-nav__group" role="group" aria-label={g.label}>
          <span className="a-nav__label" aria-hidden="true">{g.label}</span>
          <div className="a-nav__items">
            {g.items.map(({ seg, label }) => {
              const href = base + seg;
              const active = seg === '' ? path === base : path === href || path.startsWith(href + '/');
              return (
                <Link key={seg} href={href} className="a-nav__item" aria-current={active ? 'page' : undefined}>
                  {label}
                  {seg === '/yape' && yapePending > 0 && (
                    <span className="a-nav__count" aria-label={`${yapePending} por revisar`}>{yapePending}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
