'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Navegación de un evento: CUATRO pestañas, cada una con sus partes a la vista.
//
//   Resumen   cómo va (lo pendiente, tres cifras, acciones) · Yapes · Estadísticas
//             (el detalle; el reporte para imprimir se abre desde ahí)
//   Evento    datos, fecha, lugar, entradas y precios, flyer — UNA sola pantalla
//   Personas  compradores · promotores (RR.PP.) · cortesías
//   Puerta    control en vivo · equipo de puerta
//
// Antes eran 10 entradas en 4 grupos, y en el celular un botón plegado que
// había que abrir para saber qué había. Ahora las 4 pestañas entran siempre
// en una fila (también en 390) y debajo va la fila de la pestaña activa, en
// texto. Las URLs no cambian: los links viejos siguen andando (/entradas
// redirige a la pantalla del evento).
type Sub = { seg: string; label: string };
type Tab = { key: string; label: string; href: string; subs: Sub[] };

const TABS: Tab[] = [
  {
    key: 'resumen', label: 'Resumen', href: '',
    subs: [{ seg: '', label: 'Cómo va' }, { seg: '/yape', label: 'Yapes' }, { seg: '/estadisticas', label: 'Estadísticas' }],
  },
  {
    key: 'evento', label: 'Evento', href: '/editar',
    subs: [{ seg: '/editar', label: 'Datos, fecha y entradas' }],
  },
  {
    key: 'personas', label: 'Personas', href: '/clientes',
    subs: [{ seg: '/clientes', label: 'Compradores' }, { seg: '/promotores', label: 'Promotores' }, { seg: '/cortesias', label: 'Cortesías' }],
  },
  {
    key: 'puerta', label: 'Puerta', href: '/accesos',
    subs: [{ seg: '/accesos', label: 'En vivo' }, { seg: '/equipo', label: 'Equipo' }],
  },
];

export function EventTabs({ eventId, yapePending }: { eventId: string; yapePending: number }) {
  const path = usePathname() ?? '';
  const base = `/admin/events/${eventId}`;
  const esSub = (seg: string) => (seg === '' ? path === base
    // El reporte para imprimir cuelga de Estadísticas.
    : seg === '/estadisticas' && path.startsWith(base + '/reporte') ? true
    : path === base + seg || path.startsWith(base + seg + '/'));
  const activa = TABS.find((t) => t.subs.some((s) => esSub(s.seg)))
    ?? (path.startsWith(base + '/entradas') ? TABS[1] : TABS[0])!;

  return (
    <nav className="a-tabs" aria-label="Secciones del evento">
      <div className="a-tabs__row">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={base + t.href}
            className="a-tabs__item"
            aria-current={t.key === activa.key ? 'page' : undefined}
          >
            {t.label}
            {t.key === 'resumen' && yapePending > 0 && (
              <span className="a-nav__count" aria-label={`${yapePending} Yape por revisar`}>{yapePending}</span>
            )}
          </Link>
        ))}
      </div>
      {activa.subs.length > 1 && (
        <div className="a-tabs__subs">
          {activa.subs.map((s) => (
            <Link key={s.seg} href={base + s.seg} className="a-tabs__sub" aria-current={esSub(s.seg) ? 'page' : undefined}>
              {s.label}
              {s.seg === '/yape' && yapePending > 0 && (
                <span className="a-nav__count" aria-label={`${yapePending} por revisar`}>{yapePending}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
