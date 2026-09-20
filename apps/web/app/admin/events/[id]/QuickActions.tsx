'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Link2, Gift, ScanLine, Check } from 'lucide-react';

// Acciones rápidas del evento: lo que el organizador hace más seguido, a un
// clic desde el Resumen. Ver página pública · compartir link · emitir
// cortesías · abrir la puerta (escáner).
export function QuickActions({
  eventId,
  publicUrl,
  isPublished,
  readOnly = false,
}: {
  eventId: string;
  publicUrl: string | null;
  isPublished: boolean;
  readOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="a-quick" role="group" aria-label="Acciones rápidas">
      {publicUrl && isPublished && (
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="s-btn s-btn--soft s-btn--sm">
          <ExternalLink aria-hidden="true" /> Ver página pública
        </a>
      )}
      {publicUrl && isPublished && (
        <button type="button" onClick={copy} className="s-btn s-btn--soft s-btn--sm">
          {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />} {copied ? 'Copiado' : 'Copiar link'}
        </button>
      )}
      {!readOnly && (
        <Link href={`/admin/events/${eventId}/cortesias`} className="s-btn s-btn--soft s-btn--sm">
          <Gift aria-hidden="true" /> Emitir cortesías
        </Link>
      )}
      <Link href="/scan" className="s-btn s-btn--soft s-btn--sm">
        <ScanLine aria-hidden="true" /> Abrir escáner
      </Link>
    </div>
  );
}
