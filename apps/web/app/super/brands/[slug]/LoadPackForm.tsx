'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loadPackAction, type PackState } from './actions';

const initial: PackState = { ok: false, message: null };

const PACK_OPTIONS = [
  { pack: 1, label: 'Pack 1 — S/200' },
  { pack: 3, label: 'Pack 3 — S/540' },
  { pack: 5, label: 'Pack 5 — S/850' },
  { pack: 10, label: 'Pack 10 — S/1500' },
];

export function LoadPackForm({
  brandId,
  slug,
}: {
  brandId: string;
  slug: string;
}) {
  const [state, action] = useFormState(loadPackAction, initial);

  return (
    <form action={action} className="s-form-row">
      <input type="hidden" name="brand_id" value={brandId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="s-form-row__field">
        <label htmlFor="pack-select" className="s-label">Elegí un pack</label>
        <select id="pack-select" name="pack" defaultValue="3" className="s-input s-select">
          {PACK_OPTIONS.map((o) => (
            <option key={o.pack} value={o.pack}>
              {o.label}
            </option>
          ))}
        </select>
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
    <button type="submit" className="s-btn s-btn--primary" disabled={pending}>
      {pending ? 'Cargando…' : 'Cargar pack'}
    </button>
  );
}
