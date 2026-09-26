'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CalendarClock } from 'lucide-react';
import { postponeEventAction } from '../edit-actions';
import { useTextos } from '@/components/IdiomaPanel';

// Postergar un evento CON ventas: mueve la fecha (deliberado, no silencioso),
// las entradas siguen válidas y se avisa por email a los compradores.
export function PostponeEvent({ eventId, startsLocal }: { eventId: string; startsLocal: string }) {
  const { t } = useTextos();
  const [value, setValue] = useState(startsLocal);
  const [pending, start] = useTransition();

  const onPostpone = () => {
    if (!value || value === startsLocal) { toast.error(t('Elige una fecha distinta.', 'Choose a different date.')); return; }
    if (!confirm(t('¿Postergar el evento a la nueva fecha? Las entradas siguen válidas y avisamos por email a los compradores.', 'Reschedule the event to the new date? Tickets remain valid and we notify buyers by email.'))) return;
    start(async () => {
      const res = await postponeEventAction(eventId, value);
      if (res.ok) toast.success(t(`Evento postergado. Aviso en camino a ${res.queued ?? 0} compradores (se envían en segundo plano).`, `Event rescheduled. Notice on its way to ${res.queued ?? 0} buyers (sent in the background).`));
      else toast.error(res.message ?? t('No se pudo postergar.', 'Could not reschedule.'));
    });
  };

  return (
    <div className="s-card">
      <h3 className="s-h3" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <CalendarClock className="h-4 w-4" /> {t('Postergar evento', 'Reschedule event')}
      </h3>
      <p className="s-card__desc" style={{ marginTop: 6 }}>
        {t('Este evento ya tiene ventas, así que la fecha no se edita arriba. Para moverla, postérgalo: las entradas ', 'This event already has sales, so the date is not edited above. To move it, reschedule it: tickets ')}<strong>{t('siguen válidas', 'remain valid')}</strong>{t(' (mismo QR) y avisamos por email a los compradores.', ' (same QR) and we notify buyers by email.')}
      </p>
      <div className="s-field" style={{ marginTop: 12 }}>
        <label className="s-label" htmlFor="postpone-date">{t('Nueva fecha y hora', 'New date and time')}</label>
        <input id="postpone-date" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="s-input" />
      </div>
      <div className="s-form-actions" style={{ marginTop: 12 }}>
        <button type="button" className="s-btn s-btn--primary s-btn--sm" disabled={pending} onClick={onPostpone}>
          {pending ? t('Postergando…', 'Rescheduling…') : t('Postergar y avisar a los compradores', 'Reschedule and notify buyers')}
        </button>
      </div>
    </div>
  );
}
