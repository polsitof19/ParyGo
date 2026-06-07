'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { setBrandAdminPasswordAction, type SetBrandPwdState } from './actions';

const init: SetBrandPwdState = { ok: false, message: null };

export function SetBrandAdminPassword({ brandId, userId, slug }: { brandId: string; userId: string; slug: string }) {
  const [state, action] = useFormState(setBrandAdminPasswordAction, init);
  return (
    <form action={action} className="s-pwd-form">
      <input type="hidden" name="brand_id" value={brandId} />
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="slug" value={slug} />
      <input
        name="password"
        type="password"
        placeholder="contraseña (8+)"
        autoComplete="new-password"
        className="s-input s-input--sm"
      />
      <Btn />
      {state.message && (
        <span className={state.ok ? 's-hint s-hint--ok' : 's-err'}>{state.message}</span>
      )}
    </form>
  );
}

function Btn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--ghost s-btn--sm" disabled={pending}>
      {pending ? '…' : 'Setear contraseña'}
    </button>
  );
}
