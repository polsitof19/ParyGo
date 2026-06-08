'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { redeemGateCodeAction, type RedeemState } from './actions';

const initial: RedeemState = { ok: false, message: null };

export function RedeemForm() {
  const [state, action] = useFormState(redeemGateCodeAction, initial);
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input
        name="code"
        maxLength={8}
        autoFocus
        autoComplete="one-time-code"
        autoCapitalize="characters"
        placeholder="••••••••"
        className="k-codeinput"
      />
      {state.message && !state.ok && (
        <p style={{ borderRadius: 'var(--r-ctl)', background: 'rgba(220,38,38,.1)', color: 'var(--deny)', padding: '10px 14px', fontSize: 14, fontWeight: 600 }}>
          {state.message}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="k-btn k-btn--brand" style={{ width: '100%', height: 52 }} disabled={pending}>
      {pending ? 'Entrando…' : 'Entrar a la puerta'}
    </button>
  );
}
