'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { inviteBrandAdminAction, type InviteState } from './actions';

const initial: InviteState = { ok: false, message: null };

export function InviteBrandAdmin({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [state, action] = useFormState(inviteBrandAdminAction, initial);

  return (
    <form action={action} className="s-form-row">
      <input type="hidden" name="brand_id" value={brandId} />
      <div className="s-form-row__field">
        <label htmlFor="invite-email" className="s-label">Invitar dueño a {brandName}</label>
        <input
          id="invite-email"
          name="email"
          type="email"
          placeholder="promotor@code.com.pe"
          required
          className="s-input"
        />
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
      {pending ? 'Enviando…' : 'Invitar'}
    </button>
  );
}
