'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

// Navegación del evento por NIVELES (pedido de Paul, 2026-09-23): Eventos →
// el evento (su menú) → una sección. En el menú del evento se vuelve a "Tus
// eventos"; dentro de una sección, al evento. Reemplaza las pestañas con
// sub-pestañas, que se leían como "muchas cosas a la vez".
export function EventBack({ eventId, eventName }: { eventId: string; eventName: string }) {
  const path = usePathname() ?? '';
  const base = `/admin/events/${eventId}`;
  // El reporte para imprimir cuelga de Estadísticas.
  const enReporte = path.startsWith(base + '/reporte');
  const href = path === base ? '/admin' : enReporte ? `${base}/estadisticas` : base;
  const label = path === base ? 'Tus eventos' : enReporte ? 'Estadísticas' : eventName;
  return (
    <Link href={href} className="s-back a-evback">
      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> <span>{label}</span>
    </Link>
  );
}
