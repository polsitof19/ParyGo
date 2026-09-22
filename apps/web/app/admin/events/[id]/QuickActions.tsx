'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Link2, Gift, ScanLine, Check, Search, Send, Download, Trophy } from 'lucide-react';

// Acciones rápidas del evento, VISIBLES (móvil incluido): lo que el organizador
// hace más seguido, a un toque desde el Resumen y desde la home (próximo
// evento). Antes buscar comprador, reenviar entrada, exportar asistentes y
// ventas por promotor vivían detrás del nav plegado del evento: 3 toques y
// había que saber dónde estaban.
//
// Rejilla de filas (.s-acts): dos columnas en el teléfono, cuatro en
// escritorio. Todos son botones de TEXTO: el primario de la pantalla es otro.
export function QuickActions({
  eventId,
  publicUrl,
  isPublished,
  readOnly = false,
  label = 'Acciones',
}: {
  eventId: string;
  publicUrl: string | null;
  isPublished: boolean;
  readOnly?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const base = `/admin/events/${eventId}`;

  async function copy() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success('Link copiado. Pégalo en tu historia o en WhatsApp.');
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error('No se pudo copiar. Mantén apretado el link de la página pública.');
    }
  }

  const live = Boolean(publicUrl && isPublished);

  return (
    <nav aria-label={label}>
      <span className="s-acts__k">{label}</span>
      <ul className="s-acts">
        <li>
          <Link href={`${base}/clientes?buscar=1`} className="s-act">
            <Search aria-hidden="true" /><span>Buscar comprador</span>
          </Link>
        </li>
        {/* Reenviar es escritura (manda un email): no en solo lectura. */}
        {!readOnly && (
          <li>
            <Link href={`${base}/clientes?reenviar=1`} className="s-act">
              <Send aria-hidden="true" /><span>Reenviar entrada</span>
            </Link>
          </li>
        )}
        <li>
          {/* Descarga directa del CSV completo (misma ruta que "CSV completo"
              en Compradores): un toque, sin pasar por la lista. */}
          <a href={`/api/admin/events/${eventId}/export-clientes`} className="s-act" download>
            <Download aria-hidden="true" /><span>Exportar asistentes</span>
          </a>
        </li>
        <li>
          <Link href={`${base}/promotores`} className="s-act">
            <Trophy aria-hidden="true" /><span>Ventas por promotor</span>
          </Link>
        </li>
        {!readOnly && (
          <li>
            <Link href={`${base}/cortesias`} className="s-act">
              <Gift aria-hidden="true" /><span>Emitir cortesías</span>
            </Link>
          </li>
        )}
        <li>
          <Link href="/scan" className="s-act">
            <ScanLine aria-hidden="true" /><span>Abrir escáner</span>
          </Link>
        </li>
        {live && (
          <li>
            <button type="button" onClick={copy} className="s-act">
              {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}<span>{copied ? 'Copiado' : 'Copiar link'}</span>
            </button>
          </li>
        )}
        {live && (
          <li>
            <a href={publicUrl!} target="_blank" rel="noopener noreferrer" className="s-act">
              <ExternalLink aria-hidden="true" /><span>Ver página pública</span>
            </a>
          </li>
        )}
      </ul>
    </nav>
  );
}
