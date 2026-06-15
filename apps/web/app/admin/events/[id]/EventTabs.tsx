'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Pencil, Ticket, Users, DoorOpen, Wallet, Megaphone, FileText } from 'lucide-react';

const TABS = [
  { seg: '', label: 'Resumen', Icon: BarChart3 },
  { seg: '/editar', label: 'Editar evento', Icon: Pencil },
  { seg: '/entradas', label: 'Editar entradas', Icon: Ticket },
  { seg: '/clientes', label: 'Clientes', Icon: Users },
  { seg: '/promotores', label: 'Promotores', Icon: Megaphone },
  { seg: '/accesos', label: 'Accesos', Icon: DoorOpen },
  { seg: '/yape', label: 'Revisar Yape', Icon: Wallet },
  { seg: '/reporte', label: 'Reporte', Icon: FileText },
] as const;

export function EventTabs({ eventId, yapePending }: { eventId: string; yapePending: number }) {
  const path = usePathname();
  const base = `/admin/events/${eventId}`;
  return (
    <nav className="a-tabs" aria-label="Secciones del evento">
      {TABS.map(({ seg, label, Icon }) => {
        const href = base + seg;
        const active = seg === '' ? path === base : path === href || path.startsWith(href + '/');
        return (
          <Link key={seg} href={href} className={`a-tab${active ? ' a-tab--on' : ''}`} aria-current={active ? 'page' : undefined}>
            <Icon className="h-4 w-4" /> {label}
            {seg === '/yape' && yapePending > 0 && <span className="a-tab__badge">{yapePending}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
