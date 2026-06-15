'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { rejectAccessRequestAction, type ReviewState } from './actions';

const initial: ReviewState = { ok: false, message: null };

export function RejectButton({ requestId }: { requestId: string }) {
  const [state, action] = useFormState(rejectAccessRequestAction, initial);
  return (
    <form
      action={action}
      onSubmit={(e) => { if (!confirm('¿Rechazar esta solicitud? No se crea ninguna marca.')) e.preventDefault(); }}
    >
      <input type="hidden" name="request_id" value={requestId} />
      <Submit />
      {state.message && !state.ok && <span className="s-muted" style={{ fontSize: 12, marginLeft: 8 }}>{state.message}</span>}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--soft s-btn--sm" disabled={pending} style={{ color: 'var(--alert)' }}>
      {pending ? 'Rechazando…' : 'Rechazar'}
    </button>
  );
}
