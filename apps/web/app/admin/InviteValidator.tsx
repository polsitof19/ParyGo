'use client';

import { useFormStatus } from 'react-dom';
import { useFormFeedback } from '@/components/useFormFeedback';
import { useTextos } from '@/components/IdiomaPanel';
import { inviteValidatorAction, type InviteValidatorState } from './actions';

const initial: InviteValidatorState = { ok: false, message: null };

export function InviteValidator() {
  const [state, action] = useFormFeedback(inviteValidatorAction, initial);
  const { t } = useTextos();
  return (
    <form action={action} className="s-form-row">
      <div className="s-form-row__field">
        <input name="email" type="email" placeholder={t('staff@tumarca.com', 'staff@yourbrand.com')} required className="s-input" />
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
  const { t } = useTextos();
  return (
    <button type="submit" className="s-btn s-btn--primary" disabled={pending}>
      {pending ? t('Invitando…', 'Inviting…') : t('Invitar validador', 'Invite door staff')}
    </button>
  );
}
