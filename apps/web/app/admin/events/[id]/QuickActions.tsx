'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Link2, ScanLine, Check } from 'lucide-react';

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
