'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { inviteValidatorAction, type InviteValidatorState } from './actions';

const initial: InviteValidatorState = { ok: false, message: null };

export function InviteValidator() {
  const [state, action] = useFormState(inviteValidatorAction, initial);
  return (
    <form action={action} className="s-form-row">
      <div className="s-form-row__field">
        <input name="email" type="email" placeholder="staff@tumarca.com" required className="s-input" />
        {state.message && (
          <p className={state.ok ? 's-hint s-hint--ok' : 's-err'}>{state.message}</p>
        )}
      </div>
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--soft" disabled={pending}>
      {pending ? 'Invitando…' : 'Invitar validador'}
    </button>
  );
}
