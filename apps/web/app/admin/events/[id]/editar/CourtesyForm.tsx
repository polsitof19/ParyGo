'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useFormFeedback } from '@/components/useFormFeedback';
import { issueCourtesyTicketsAction, type CourtesyState } from '../courtesy-actions';
import { useTextos } from '@/components/IdiomaPanel';

const initial: CourtesyState = { ok: false, message: null };
type TT = { id: string; name: string };

export function CourtesyForm({ eventId, ticketTypes, defaultEmail = '' }: { eventId: string; ticketTypes: TT[]; defaultEmail?: string }) {
  const { t } = useTextos();
  const [state, action] = useFormFeedback(issueCourtesyTicketsAction, initial);
  const [typeId, setTypeId] = useState(ticketTypes[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [email, setEmail] = useState(defaultEmail);

  if (ticketTypes.length === 0) {
    return <p className="s-card__desc">{t('Crea un tipo de entrada activo antes de emitir cortesías.', 'Create an active ticket type before issuing complimentary tickets.')}</p>;
  }
  const typeName = ticketTypes.find((tt) => tt.id === typeId)?.name ?? '';

  // Confirmación clara antes de emitir entradas reales.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const ok = window.confirm(t(
      `Vas a emitir ${qty} ${typeName} de cortesía y enviarlas a ${email}. Ocupan lugar real (descuentan del aforo). ¿Confirmas?`,
      `You are about to issue ${qty} ${typeName} as complimentary tickets and send them to ${email}. They take up real space (count against capacity). Confirm?`,
    ));
    if (!ok) e.preventDefault();
  }

  return (
    <form action={action} onSubmit={onSubmit} className="s-stack" style={{ gap: 12 }}>
      <input type="hidden" name="event_id" value={eventId} />
      <div>
        <label className="s-label" htmlFor="ct_type">{t('Tipo de entrada', 'Ticket type')}</label>
        <select id="ct_type" name="ticket_type_id" value={typeId} onChange={(e) => setTypeId(e.target.value)} className="s-input" required>
          {ticketTypes.map((tt) => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
        </select>
      </div>
      <div className="s-form-grid">
        <div>
          <label className="s-label" htmlFor="ct_qty">{t('Cantidad (máx 100)', 'Quantity (max 100)')}</label>
          <input id="ct_qty" name="quantity" type="number" min={1} max={100} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className="s-input" required />
        </div>
        <div>
          <label className="s-label" htmlFor="ct_email">{t('Enviar a', 'Send to')}</label>
          <input id="ct_email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="promotor@correo.com" className="s-input" required />
        </div>
      </div>
      {state.message && <p className={state.ok ? 's-banner s-banner--ok' : 's-banner s-banner--err'}>{state.message}</p>}
      <div className="s-form-actions"><CourtesySubmit /></div>
    </form>
  );
}

function CourtesySubmit() {
  const { t } = useTextos();
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--primary" disabled={pending}>
      {pending ? t('Emitiendo…', 'Issuing…') : t('Emitir y enviar', 'Issue and send')}
    </button>
  );
}
