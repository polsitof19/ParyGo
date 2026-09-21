'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Check } from 'lucide-react';

// Botón para copiar al portapapeles. `label` es QUÉ se copia ("número",
// "monto"): el botón dice "Copiar número" y el aviso, "número copiado".
// Mismo patrón que ShareEvent: navigator.clipboard.writeText + feedback.
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copiado`);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error('No se pudo copiar');
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copiar ${label}`}
      className="c-btn c-btn--soft"
      style={{ height: 34, padding: '0 12px', fontSize: 13 }}
    >
      {copied ? <><Check className="h-4 w-4" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar {label}</>}
    </button>
  );
}
