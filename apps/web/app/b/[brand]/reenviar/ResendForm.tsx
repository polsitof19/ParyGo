'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Mail } from 'lucide-react';
import { resendMyTickets, type ResendResult } from './actions';

const initial: ResendResult = { ok: false, message: '' };

export function ResendForm() {
  const [state, action] = useFormState(resendMyTickets, initial);
  // Éxito = respuesta neutra (no revela si el email existe).
  const sent = state.ok && !!state.message;

  return (
    <form action={action} style={{ marginTop: 'var(--b-s4)' }}>
      <div className="c-field">
        <label htmlFor="email" className="c-label">Tu email</label>
        <input
          id="email" name="email" type="email" required autoComplete="email" inputMode="email"
          placeholder="tu@email.com" className="c-input"
        />
        <p className="c-help">Usa el mismo email con el que compraste. Te reenviamos tus QR ahí.</p>
      </div>
      {state.message && (
        <p
          className={`c-help c-state__dot c-state__dot--${sent ? 'ok' : 'alert'}`}
          role="status"
        >
          {state.message}
        </p>
      )}
      <div style={{ marginTop: 'var(--b-s3)' }}>
        <Submit />
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="c-btn c-btn--brand c-btn--block c-btn--lg" disabled={pending}>
      <Mail aria-hidden="true" /> {pending ? 'Enviando…' : 'Reenviar mi entrada'}
    </button>
  );
}
