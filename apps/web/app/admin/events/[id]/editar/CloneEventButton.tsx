'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import { cloneEventAction } from '../edit-actions';

// Clona el evento como BORRADOR (copia datos + tipos + fases). Usa 1 evento de
// saldo (es un evento nuevo). En éxito, la acción redirige al borrador nuevo.
export function CloneEventButton({ eventId }: { eventId: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  const onClone = () => {
    if (done) return;
    if (!confirm('Se va a crear un BORRADOR nuevo con los mismos datos y entradas. Usa 1 evento de tu saldo. ¿Clonar?')) return;
    start(async () => {
      const res = await cloneEventAction(eventId);
      // Si la acción redirige (éxito), no llegamos acá. Solo vemos res en error.
      if (res && !res.ok) toast.error(res.message ?? 'No se pudo clonar.');
      else setDone(true);
    });
  };

  return (
    <div className="s-card">
      <h3 className="s-h2" style={{ fontSize: 16, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <Copy className="h-4 w-4" /> Clonar evento
      </h3>
      <p className="s-card__desc" style={{ marginTop: 6 }}>
        Creá un borrador nuevo con los mismos datos, tipos de entrada y precios. Ideal para tu próxima
        fecha. Usa 1 evento de tu saldo; el evento original no se toca.
      </p>
      <div className="s-form-actions" style={{ marginTop: 12 }}>
        <button type="button" className="s-btn s-btn--soft s-btn--sm" disabled={pending || done} onClick={onClone}>
          {pending ? 'Clonando…' : 'Clonar como borrador'}
        </button>
      </div>
    </div>
  );
}
