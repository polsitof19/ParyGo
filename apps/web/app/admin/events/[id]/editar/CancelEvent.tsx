'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Ban } from 'lucide-react';
import { cancelEventAction } from '../edit-actions';

// Cancelar un evento: lo despublica y avisa por email a TODOS los compradores
// con entradas válidas. Acto deliberado e irreversible en la práctica → doble
// confirmación + motivo opcional. No toca tickets ni dinero.
export function CancelEvent({ eventId, eventName, cancelled }: { eventId: string; eventName: string; cancelled: boolean }) {
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();

  if (cancelled) {
    return (
      <div className="s-card" style={{ borderColor: 'var(--alert, #D7472F)' }}>
        <h3 className="s-h2" style={{ fontSize: 16, display: 'inline-flex', gap: 8, alignItems: 'center', color: 'var(--alert, #D7472F)' }}>
          <Ban className="h-4 w-4" /> Evento cancelado
        </h3>
        <p className="s-card__desc" style={{ marginTop: 6 }}>Este evento está cancelado: no se vende y no aparece en público. Ya se avisó por email a los compradores.</p>
      </div>
    );
  }

  const onCancel = () => {
    const typed = window.prompt(`Vas a CANCELAR "${eventName}". Esto lo despublica y manda un email de cancelación a TODOS los compradores. No se puede deshacer.\n\nEscribí CANCELAR para confirmar:`);
    if ((typed ?? '').trim().toUpperCase() !== 'CANCELAR') return;
    start(async () => {
      const res = await cancelEventAction(eventId, reason);
      if (res.ok) toast.success(`Evento cancelado. Aviso en camino a ${res.queued ?? 0} compradores (se envían en segundo plano).`);
      else toast.error(res.message ?? 'No se pudo cancelar.');
    });
  };

  return (
    <div className="s-card" style={{ borderColor: 'var(--alert, #D7472F)' }}>
      <h3 className="s-h2" style={{ fontSize: 16, display: 'inline-flex', gap: 8, alignItems: 'center', color: 'var(--alert, #D7472F)' }}>
        <Ban className="h-4 w-4" /> Cancelar evento
      </h3>
      <p className="s-card__desc" style={{ marginTop: 6 }}>
        Si el evento no se hará, cancelalo: deja de venderse, desaparece del público y se <strong>avisa por email</strong> a todos los compradores.
        Las entradas y los pagos no se tocan — los reembolsos los coordinás vos. <strong>No se puede deshacer.</strong>
      </p>
      <div className="s-field" style={{ marginTop: 12 }}>
        <label className="s-label" htmlFor="cancel-reason">Motivo (opcional, se incluye en el email)</label>
        <textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} className="s-input" style={{ resize: 'vertical' }} placeholder="Ej: problemas con el local" />
      </div>
      <div className="s-form-actions" style={{ marginTop: 12 }}>
        <button type="button" className="s-btn s-btn--sm" style={{ background: 'var(--alert, #D7472F)', color: '#fff' }} disabled={pending} onClick={onCancel}>
          {pending ? 'Cancelando…' : 'Cancelar evento y avisar a los compradores'}
        </button>
      </div>
    </div>
  );
}
