'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Mail, Check } from 'lucide-react';
import { resendMyTickets, type ResendResult } from './actions';

const initial: ResendResult = { ok: false, message: '' };

export function ResendForm() {
  const [state, action] = useFormState(resendMyTickets, initial);
  // Éxito = respuesta neutra (no revela si el email existe).
  const sent = state.ok && !!state.message;

  return (
    <form action={action} className="c-card" style={{ marginTop: 18 }}>
      <div className="c-field">
        <label htmlFor="email" className="c-label">Tu email</label>
        <input
          id="email" name="email" type="email" required autoComplete="email" inputMode="email"
          placeholder="tu@email.com" className="c-input"
        />
        <p className="c-help">Usá el mismo email con el que compraste. Te reenviamos tus QR ahí.</p>
      </div>
      {state.message && (
        <p
          className="c-help"
          role="status"
          style={{ marginTop: 4, color: sent ? 'var(--ok)' : 'var(--alert)', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {sent && <Check className="h-4 w-4" />} {state.message}
        </p>
      )}
      <div style={{ marginTop: 14 }}>
        <Submit />
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="c-btn c-btn--brand" disabled={pending} style={{ width: '100%' }}>
      <Mail className="h-4 w-4" /> {pending ? 'Enviando…' : 'Reenviar mi entrada'}
    </button>
  );
}
