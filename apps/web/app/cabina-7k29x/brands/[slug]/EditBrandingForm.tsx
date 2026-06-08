'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { BrandingFields } from '../BrandingFields';
import { updateBrandBrandingAction, type BrandingState } from './actions';

const initial: BrandingState = { ok: false, message: null };

export function EditBrandingForm({
  brandId,
  primaryColor,
  logoUrl,
}: {
  brandId: string;
  primaryColor: string;
  logoUrl: string | null;
}) {
  const [state, action] = useFormState(updateBrandBrandingAction, initial);

  return (
    <form action={action}>
      <input type="hidden" name="brand_id" value={brandId} />
      <BrandingFields defaultColor={primaryColor} currentLogoUrl={logoUrl} />
      {state.fieldErrors?.logo && <p className="s-err">{state.fieldErrors.logo}</p>}
      {state.fieldErrors?.primary_color && <p className="s-err">{state.fieldErrors.primary_color}</p>}
      {state.message && (
        <p className={state.ok ? 's-banner s-banner--ok' : 's-banner s-banner--err'} style={{ marginTop: 12 }}>
          {state.message}
        </p>
      )}
      <div className="s-form-actions" style={{ marginTop: 14 }}>
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--primary" disabled={pending}>
      {pending ? 'Guardando…' : 'Guardar branding'}
    </button>
  );
}
