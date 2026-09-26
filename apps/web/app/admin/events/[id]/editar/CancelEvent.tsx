'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Ban } from 'lucide-react';
import { cancelEventAction } from '../edit-actions';
import { useTextos } from '@/components/IdiomaPanel';

// Cancelar un evento: lo despublica y avisa por email a TODOS los compradores
// con entradas válidas. Acto deliberado e irreversible en la práctica → doble
// confirmación + motivo opcional. No toca tickets ni dinero.
export function CancelEvent({ eventId, eventName, cancelled }: { eventId: string; eventName: string; cancelled: boolean }) {
  const { t } = useTextos();
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();

  if (cancelled) {
    return (
      <div className="s-card s-card--confirm-danger">
        <h3 className="s-h3" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <Ban className="h-4 w-4" /> {t('Evento cancelado', 'Event cancelled')}
        </h3>
        <p className="s-card__desc" style={{ marginTop: 6 }}>{t('Este evento está cancelado: no se vende y no aparece en público. Ya se avisó por email a los compradores.', 'This event is cancelled: it no longer sells and does not appear publicly. Buyers have already been notified by email.')}</p>
      </div>
    );
  }

  const onCancel = () => {
    const typed = window.prompt(t(
      `Vas a CANCELAR "${eventName}". Esto lo despublica y manda un email de cancelación a TODOS los compradores. No se puede deshacer.\n\nEscribe CANCELAR para confirmar:`,
      `You are about to CANCEL "${eventName}". This unpublishes it and sends a cancellation email to ALL buyers. This cannot be undone.\n\nType CANCELAR to confirm:`,
    ));
    if ((typed ?? '').trim().toUpperCase() !== 'CANCELAR') return;
    start(async () => {
      const res = await cancelEventAction(eventId, reason);
      if (res.ok) toast.success(t(`Evento cancelado. Aviso en camino a ${res.queued ?? 0} compradores (se envían en segundo plano).`, `Event cancelled. Notice on its way to ${res.queued ?? 0} buyers (sent in the background).`));
      else toast.error(res.message ?? t('No se pudo cancelar.', 'Could not cancel.'));
    });
  };

  return (
    <div className="s-card s-card--confirm-danger">
      <h3 className="s-h3" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <Ban className="h-4 w-4" /> {t('Cancelar evento', 'Cancel event')}
      </h3>
      <p className="s-card__desc" style={{ marginTop: 6 }}>
        {t('Si el evento no se hará, cancelalo: deja de venderse, desaparece del público y se ', 'If the event will not happen, cancel it: it stops selling, disappears from the public and ')}<strong>{t('avisa por email', 'buyers are notified by email')}</strong>{t(' a todos los compradores. Las entradas y los pagos no se tocan — los reembolsos los coordinas tú. ', '. Tickets and payments are not touched — you coordinate refunds yourself. ')}<strong>{t('No se puede deshacer.', 'This cannot be undone.')}</strong>
      </p>
      <div className="s-field" style={{ marginTop: 12 }}>
        <label className="s-label" htmlFor="cancel-reason">{t('Motivo (opcional, se incluye en el email)', 'Reason (optional, included in the email)')}</label>
        <textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} className="s-input" style={{ resize: 'vertical' }} placeholder={t('Ej: problemas con el local', 'E.g.: venue issues')} />
      </div>
      <div className="s-form-actions" style={{ marginTop: 12 }}>
        <button type="button" className="s-btn s-btn--danger s-btn--sm" disabled={pending} onClick={onCancel}>
          {pending ? t('Cancelando…', 'Cancelling…') : t('Cancelar evento y avisar a los compradores', 'Cancel event and notify buyers')}
        </button>
      </div>
    </div>
  );
}
