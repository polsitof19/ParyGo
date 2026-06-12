'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateBrandBasicsAction, type BrandBasicsState } from './actions';

const initial: BrandBasicsState = { ok: false, message: null };

export function EditBrandBasicsForm({
  brandId,
  name,
  contactEmail,
  whatsapp,
  yapeNumber,
  yapeHolder,
}: {
  brandId: string;
  name: string;
  contactEmail: string | null;
  whatsapp: string | null;
  yapeNumber: string | null;
  yapeHolder: string | null;
}) {
  const [state, action] = useFormState(updateBrandBasicsAction, initial);

  return (
    <form action={action} className="s-stack" style={{ gap: 12, marginTop: 14 }}>
      <input type="hidden" name="brand_id" value={brandId} />

      <div className="s-field">
        <label className="s-label" htmlFor="br-name">Nombre de la marca</label>
        <input id="br-name" name="name" defaultValue={name} className="s-input" required maxLength={120} />
        {state.fieldErrors?.name && <p className="s-err">{state.fieldErrors.name}</p>}
      </div>

      <div className="s-form-grid">
        <div className="s-field">
          <label className="s-label" htmlFor="br-email">Email</label>
          <input id="br-email" name="contact_email" type="email" defaultValue={contactEmail ?? ''} className="s-input" placeholder="contacto@marca.com" />
          {state.fieldErrors?.contact_email && <p className="s-err">{state.fieldErrors.contact_email}</p>}
        </div>
        <div className="s-field">
          <label className="s-label" htmlFor="br-wa">WhatsApp</label>
          <input id="br-wa" name="whatsapp_e164" defaultValue={whatsapp ?? ''} className="s-input" placeholder="+51999000111" />
          {state.fieldErrors?.whatsapp_e164 && <p className="s-err">{state.fieldErrors.whatsapp_e164}</p>}
        </div>
      </div>

      <div className="s-form-grid">
        <div className="s-field">
          <label className="s-label" htmlFor="br-yapenum">Yape número</label>
          <input id="br-yapenum" name="yape_number" defaultValue={yapeNumber ?? ''} className="s-input" inputMode="numeric" maxLength={20} />
        </div>
        <div className="s-field">
          <label className="s-label" htmlFor="br-yapeholder">Yape titular</label>
          <input id="br-yapeholder" name="yape_holder" defaultValue={yapeHolder ?? ''} className="s-input" maxLength={120} />
        </div>
      </div>

      {state.message && (
        <p className={state.ok ? 's-banner s-banner--ok' : 's-banner s-banner--err'} style={{ marginTop: 4 }}>
          {state.message}
        </p>
      )}
      <div className="s-form-actions">
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--primary s-btn--sm" disabled={pending}>
      {pending ? 'Guardando…' : 'Guardar datos'}
    </button>
  );
}
