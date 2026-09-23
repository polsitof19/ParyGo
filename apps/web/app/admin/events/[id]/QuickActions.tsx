'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Link2, Gift, ScanLine, Check, Search, Send, Download, BarChart3, PencilLine } from 'lucide-react';

// Los dos botones del evento que viene: ABRIR ESCÁNER y COPIAR LINK. Son lo
// que el organizador hace la noche del evento y los días antes (compartir),
// así que van como botones y no como filas. El escáner es el primario salvo
// que la pantalla ya tenga otro (Yapes por aprobar): uno solo por pantalla.
export function EventButtons({
  publicUrl,
  isPublished,
  scannerPrimary = true,
  readOnly = false,
}: {
  publicUrl: string | null;
  isPublished: boolean;
  scannerPrimary?: boolean;
  readOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const live = Boolean(publicUrl && isPublished);

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

  if (readOnly && !live) return null;
  return (
    <div className="a-evbtns">
      {!readOnly && (
        <Link href="/scan" className={`s-btn ${scannerPrimary ? 's-btn--primary' : 's-btn--soft'}`}>
          <ScanLine aria-hidden="true" /> Abrir escáner
        </Link>
      )}
      {live && (
        <button type="button" onClick={copy} className="s-btn s-btn--soft">
          {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />} {copied ? 'Copiado' : 'Copiar link'}
        </button>
      )}
    </div>
  );
}

// Acciones del evento, VISIBLES y AGRUPADAS por para qué sirven (referencia
// aprobada 2026-09-23): "Asistentes" (la gente que compró) y "Venta" (lo que
// mueve la plata). Filas de 52 con ícono y chevron, como un menú de ajustes;
// una columna en el teléfono, dos en la compu (.s-acts, parygo-panel.css).
export function QuickActions({
  eventId,
  publicUrl,
  isPublished,
  readOnly = false,
  showEdit = false,
  showPublic = true,
}: {
  eventId: string;
  publicUrl: string | null;
  isPublished: boolean;
  readOnly?: boolean;
  showEdit?: boolean;
  /** En el evento la cabecera ya tiene "Ver página pública": no repetirlo. */
  showPublic?: boolean;
}) {
  const base = `/admin/events/${eventId}`;
  const live = Boolean(publicUrl && isPublished);

  return (
    <nav aria-label="Acciones del evento" className="a-actgroups">
      <div>
        <span className="s-acts__k">Asistentes</span>
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
        </ul>
      </div>
      <div>
        <span className="s-acts__k">Venta</span>
        <ul className="s-acts">
          {!readOnly && (
            <li>
              <Link href={`${base}/cortesias`} className="s-act">
                <Gift aria-hidden="true" /><span>Emitir cortesías</span>
              </Link>
            </li>
          )}
          <li>
            <Link href={`${base}/promotores`} className="s-act">
              <BarChart3 aria-hidden="true" /><span>Ventas por promotor</span>
            </Link>
          </li>
          {showEdit && !readOnly && (
            <li>
              <Link href={`${base}/editar`} className="s-act">
                <PencilLine aria-hidden="true" /><span>Editar evento y entradas</span>
              </Link>
            </li>
          )}
          {live && showPublic && (
            <li>
              <a href={publicUrl!} target="_blank" rel="noopener noreferrer" className="s-act">
                <ExternalLink aria-hidden="true" /><span>Ver página pública</span>
              </a>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
