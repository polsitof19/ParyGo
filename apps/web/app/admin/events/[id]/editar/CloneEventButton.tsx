'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import { cloneEventAction } from '../edit-actions';
import { useTextos } from '@/components/IdiomaPanel';

// Clona el evento como BORRADOR (copia datos + tipos + fases). Usa 1 evento de
// saldo (es un evento nuevo). En éxito, la acción redirige al borrador nuevo.
export function CloneEventButton({ eventId }: { eventId: string }) {
  const { t } = useTextos();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  const onClone = () => {
    if (done) return;
    if (!confirm(t('Se va a crear un BORRADOR nuevo con los mismos datos y entradas. Usa 1 evento de tu saldo. ¿Clonar?', 'A new DRAFT will be created with the same data and tickets. It uses 1 event from your balance. Duplicate?'))) return;
    start(async () => {
      const res = await cloneEventAction(eventId);
      // Si la acción redirige (éxito), no llegamos acá. Solo vemos res en error.
      if (res && !res.ok) toast.error(res.message ?? t('No se pudo clonar.', 'Could not duplicate.'));
      else setDone(true);
    });
  };

  return (
    <div className="s-card">
      <h3 className="s-h3" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <Copy className="h-4 w-4" /> {t('Clonar evento', 'Duplicate event')}
      </h3>
      <p className="s-card__desc" style={{ marginTop: 6 }}>
        {t('Crea un borrador nuevo con los mismos datos, tipos de entrada y precios. Ideal para tu próxima fecha. Usa 1 evento de tu saldo; el evento original no se toca.', 'Creates a new draft with the same data, ticket types and prices. Ideal for your next date. It uses 1 event from your balance; the original event is not touched.')}
      </p>
      <div className="s-form-actions" style={{ marginTop: 12 }}>
        <button type="button" className="s-btn s-btn--soft s-btn--sm" disabled={pending || done} onClick={onClone}>
          {pending ? t('Clonando…', 'Duplicating…') : t('Clonar como borrador', 'Duplicate as draft')}
        </button>
      </div>
    </div>
  );
}
