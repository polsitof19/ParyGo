'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { issueCourtesyTicketsAction, type CourtesyState } from '../courtesy-actions';

const initial: CourtesyState = { ok: false, message: null };
type TT = { id: string; name: string };

export function CourtesyForm({ eventId, ticketTypes }: { eventId: string; ticketTypes: TT[] }) {
  const [state, action] = useFormState(issueCourtesyTicketsAction, initial);
  const [typeId, setTypeId] = useState(ticketTypes[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [email, setEmail] = useState('');

  if (ticketTypes.length === 0) {
    return <p className="s-card__desc">Creá un tipo de entrada activo antes de emitir cortesías.</p>;
  }
  const typeName = ticketTypes.find((t) => t.id === typeId)?.name ?? '';

  // Confirmación clara antes de emitir entradas reales.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const ok = window.confirm(`Vas a emitir ${qty} ${typeName} de cortesía y enviarlas a ${email}. Ocupan lugar real (descuentan del aforo). ¿Confirmás?`);
    if (!ok) e.preventDefault();
  }

  return (
    <form action={action} onSubmit={onSubmit} className="s-stack" style={{ gap: 12 }}>
      <input type="hidden" name="event_id" value={eventId} />
      <div>
        <label className="s-label" htmlFor="ct_type">Tipo de entrada</label>
        <select id="ct_type" name="ticket_type_id" value={typeId} onChange={(e) => setTypeId(e.target.value)} className="s-input" required>
          {ticketTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="s-form-grid">
        <div>
          <label className="s-label" htmlFor="ct_qty">Cantidad (máx 100)</label>
          <input id="ct_qty" name="quantity" type="number" min={1} max={100} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className="s-input" required />
        </div>
        <div>
          <label className="s-label" htmlFor="ct_email">Email destino</label>
          <input id="ct_email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="promotor@correo.com" className="s-input" required />
        </div>
      </div>
      {state.message && <p className={state.ok ? 's-banner s-banner--ok' : 's-banner s-banner--err'}>{state.message}</p>}
      <div className="s-form-actions"><CourtesySubmit /></div>
    </form>
  );
}

function CourtesySubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--primary" disabled={pending}>
      {pending ? 'Emitiendo…' : 'Emitir y enviar'}
    </button>
  );
}
