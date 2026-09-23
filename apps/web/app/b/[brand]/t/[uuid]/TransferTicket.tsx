'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Gift } from 'lucide-react';
import { transferTicketAction, type TransferState } from './actions';

const initial: TransferState = { ok: false, message: '' };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="c-btn c-btn--brand c-btn--block" disabled={pending}>
      {pending ? 'Transfiriendo…' : 'Transferir entrada'}
    </button>
  );
}

// Transferir/regalar la entrada a otra persona. Reemite el QR (este link deja de
// servir) y se lo manda por email al nuevo dueño. Solo visible si el evento lo
// permite y la entrada no fue usada ni anulada.
export function TransferTicket({ qrCode }: { qrCode: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(transferTicketAction, initial);

  if (state.ok) {
    return (
      <div className="c-card" style={{ marginTop: 'var(--b-s3)' }}>
        <p className="c-state__dot c-state__dot--ok" style={{ fontWeight: 700 }}>Entrada transferida</p>
        <p className="c-muted" style={{ marginTop: 'var(--b-sx)', fontSize: 'var(--b-meta)' }}>{state.message}</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 'var(--b-s3)' }}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="c-btn c-btn--soft c-btn--block">
          <Gift className="h-4 w-4" /> Transferir o regalar esta entrada
        </button>
      ) : (
        <form action={action} className="c-stack" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="hidden" name="qr" value={qrCode} />
          <p className="c-card__title" style={{ marginBottom: 0 }}>Transferir entrada</p>
          <p className="c-muted" style={{ fontSize: 'var(--b-sec)' }}>Le mandamos el QR al nuevo dueño y <strong>este enlace deja de funcionar</strong>. No se puede deshacer.</p>
          <div className="c-field">
            <label className="c-label" htmlFor="t-name">Nombre del nuevo dueño</label>
            <input id="t-name" name="new_name" required minLength={2} maxLength={120} className="c-input" placeholder="Nombre y apellido" autoComplete="off" />
          </div>
          <div className="c-field">
            <label className="c-label" htmlFor="t-email">Email del nuevo dueño</label>
            <input id="t-email" name="new_email" type="email" required maxLength={200} inputMode="email" className="c-input" placeholder="nuevo@email.com" autoComplete="off" />
          </div>
          {state.message && !state.ok && <p className="c-err">{state.message}</p>}
          <Submit />
          <button type="button" onClick={() => setOpen(false)} className="c-btn c-btn--ghost" style={{ margin: '0 auto' }}>Cancelar</button>
        </form>
      )}
    </div>
  );
}
