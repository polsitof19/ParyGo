'use client';

import { useFormStatus } from 'react-dom';
import { useFormFeedback } from '@/components/useFormFeedback';
import { loadPackAction, type PackState } from './actions';
import { PACKS } from '@/lib/packs';
import { formatPEN } from '@/lib/utils';

const initial: PackState = { ok: false, message: null };

// Precios de lib/packs.ts (la misma fuente que la compra del organizador).
const PACK_OPTIONS = PACKS.map((p) => ({ pack: p.eventos, label: `Pack ${p.eventos} — ${formatPEN(p.pen)}` }));

export function LoadPackForm({
  brandId,
  slug,
}: {
  brandId: string;
  slug: string;
}) {
  const [state, action] = useFormFeedback(loadPackAction, initial);

  return (
    <form action={action} className="s-form-row">
      <input type="hidden" name="brand_id" value={brandId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="s-form-row__field">
        <label htmlFor="pack-select" className="s-label">Elige un pack</label>
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
