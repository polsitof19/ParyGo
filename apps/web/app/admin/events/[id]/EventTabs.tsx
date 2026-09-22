'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

// Navegación del evento en 4 GRUPOS (antes: 8 pestañas planas al mismo nivel,
// con pares confusos como "Editar evento"/"Editar entradas" y "Accesos", que
// sonaba a permisos pero era el monitor de la puerta). Ver
// design_handoff_refresco_paneles/INSPECCION-panel-organizador-y-entrada.md.
// Las URLs no cambian (bookmarks y links viejos siguen andando): /accesos es
// "En la puerta".
//
// EN EL TELÉFONO se PLIEGA. Medido en iPhone (390x844): los 4 grupos con sus
// 10 entradas piden 937px de ancho en una pantalla de 358 — o sea 2,6
// pantallas de deslizamiento horizontal, con las últimas secciones invisibles
// y sin nada que avisara que estaban ahí. Ahora en ≤640 el nav es un botón que
// dice DÓNDE estás ("Ventas y pagos · Revisar Yape") y al abrirlo muestra los
// cuatro grupos completos, apilados, sin deslizar nada. Arriba de 640 el botón
// desaparece y vuelve la barra de siempre.
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
  const [open, setOpen] = useState(false);
  const base = `/admin/events/${eventId}`;

  const esActivo = (seg: string) => {
    const href = base + seg;
    return seg === '' ? path === base : path === href || path.startsWith(href + '/');
  };

  // Dónde estamos, para el botón plegado. El "Resumen" es el fallback: si la
  // ruta no coincide con ninguna entrada, seguimos dentro del evento.
  const aqui = GROUPS.flatMap((g) => g.items.map((i) => ({ g: g.label, i })))
    .find(({ i }) => esActivo(i.seg));

  return (
    <nav className={`a-nav${open ? ' a-nav--open' : ''}`} aria-label="Secciones del evento">
      <button
        type="button"
        className="a-nav__toggle"
        aria-expanded={open}
        aria-controls="a-nav-grupos"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="a-nav__toggle-txt">
          <span className="a-nav__toggle-k">Sección</span>
          <span className="a-nav__toggle-v">
            {aqui ? `${aqui.g} · ${aqui.i.label}` : 'Mi evento · Resumen'}
          </span>
        </span>
        {yapePending > 0 && !open && (
          <span className="a-nav__count" aria-label={`${yapePending} Yape por revisar`}>{yapePending}</span>
        )}
        <ChevronDown className="a-nav__toggle-chev" aria-hidden="true" />
      </button>

      <div className="a-nav__groups" id="a-nav-grupos">
        {GROUPS.map((g) => (
          <div key={g.label} className="a-nav__group" role="group" aria-label={g.label}>
            <span className="a-nav__label" aria-hidden="true">{g.label}</span>
            <div className="a-nav__items">
              {g.items.map(({ seg, label }) => {
                const href = base + seg;
                const active = esActivo(seg);
                return (
                  <Link
                    key={seg}
                    href={href}
                    className="a-nav__item"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                  >
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
      </div>
    </nav>
  );
}
