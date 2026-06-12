'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CalendarClock } from 'lucide-react';
import { postponeEventAction } from '../edit-actions';

// Postergar un evento CON ventas: mueve la fecha (deliberado, no silencioso),
// las entradas siguen válidas y se avisa por email a los compradores.
export function PostponeEvent({ eventId, startsLocal }: { eventId: string; startsLocal: string }) {
  const [value, setValue] = useState(startsLocal);
  const [pending, start] = useTransition();

  const onPostpone = () => {
    if (!value || value === startsLocal) { toast.error('Elige una fecha distinta.'); return; }
    if (!confirm('¿Postergar el evento a la nueva fecha? Las entradas siguen válidas y avisamos por email a los compradores.')) return;
    start(async () => {
      const res = await postponeEventAction(eventId, value);
      if (res.ok) toast.success(`Evento postergado. Aviso enviado a ${res.emailsSent}/${res.emailsTotal} compradores.`);
      else toast.error(res.message ?? 'No se pudo postergar.');
    });
  };

  return (
    <div className="s-card" style={{ borderColor: 'var(--tangerine)' }}>
      <h3 className="s-h2" style={{ fontSize: 16, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <CalendarClock className="h-4 w-4" /> Postergar evento
      </h3>
      <p className="s-card__desc" style={{ marginTop: 6 }}>
        Este evento ya tiene ventas, así que la fecha no se edita arriba. Para moverla, postérgalo:
        las entradas <strong>siguen válidas</strong> (mismo QR) y avisamos por email a los compradores.
      </p>
      <div className="s-field" style={{ marginTop: 12 }}>
        <label className="s-label" htmlFor="postpone-date">Nueva fecha y hora</label>
        <input id="postpone-date" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="s-input" />
      </div>
      <div className="s-form-actions" style={{ marginTop: 12 }}>
        <button type="button" className="s-btn s-btn--primary s-btn--sm" disabled={pending} onClick={onPostpone}>
          {pending ? 'Postergando…' : 'Postergar y avisar a los compradores'}
        </button>
      </div>
    </div>
  );
}
