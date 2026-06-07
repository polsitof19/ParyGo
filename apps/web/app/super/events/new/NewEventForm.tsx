'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createEventAction, type FormState } from './actions';

const initial: FormState = { ok: false, message: null, fieldErrors: {} };

type Brand = { id: string; slug: string; name: string };

// "YYYY-MM-DDTHH:mm" for use as a datetime-local min value.
function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewEventForm({
  brands,
  preselectedSlug,
}: {
  brands: Brand[];
  preselectedSlug: string | null;
}) {
  const [state, action] = useFormState(createEventAction, initial);
  const preselected = brands.find((b) => b.slug === preselectedSlug);
  const minDateTime = nowLocalInput();

  return (
    <form action={action} className="s-stack" style={{ gap: 16 }}>
      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 14 }}>Marca</p>
        <Field id="brand_id" label="Promotor" required error={state.fieldErrors?.brand_id}>
          <select
            id="brand_id"
            name="brand_id"
            required
            defaultValue={preselected?.id ?? ''}
            className="s-input s-select"
          >
            <option value="" disabled>Elegí marca</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.slug})</option>
            ))}
          </select>
        </Field>
      </section>

      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 14 }}>Evento</p>
        <Field id="name" label="Nombre del evento" required error={state.fieldErrors?.name}>
          <input id="name" name="name" className="s-input" placeholder="Density · Noche 04" required />
        </Field>
        <div className="s-field">
          <Field id="slug" label="Slug" hint="Ej: density-04 → code.parygo.com/density-04" required error={state.fieldErrors?.slug}>
            <input id="slug" name="slug" className="s-input" placeholder="density-04" pattern="^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$" required />
          </Field>
        </div>
        <div className="s-field">
          <Field id="description" label="Descripción corta">
            <textarea id="description" name="description" rows={3} className="s-input" placeholder="DJ Headliner · Club Foso · Lima" />
          </Field>
        </div>
        <div className="s-form-grid s-field">
          <Field id="starts_at" label="Inicio" required error={state.fieldErrors?.starts_at}>
            <input id="starts_at" name="starts_at" type="datetime-local" className="s-input" min={minDateTime} required />
          </Field>
          <Field id="ends_at" label="Fin estimado">
            <input id="ends_at" name="ends_at" type="datetime-local" className="s-input" min={minDateTime} />
          </Field>
        </div>
      </section>

      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 14 }}>Venue</p>
        <Field id="venue_name" label="Nombre del local">
          <input id="venue_name" name="venue_name" className="s-input" placeholder="Club Foso" />
        </Field>
        <div className="s-field">
          <Field id="venue_address" label="Dirección">
            <input id="venue_address" name="venue_address" className="s-input" placeholder="Av. Foso 123, Miraflores" />
          </Field>
        </div>
        <div className="s-form-grid s-field">
          <Field id="venue_lat" label="Latitud (opcional)">
            <input id="venue_lat" name="venue_lat" type="number" step="0.00001" className="s-input" placeholder="-12.0464" />
          </Field>
          <Field id="venue_lng" label="Longitud (opcional)">
            <input id="venue_lng" name="venue_lng" type="number" step="0.00001" className="s-input" placeholder="-77.0428" />
          </Field>
        </div>
        <div className="s-field">
          <Field id="min_age" label="Edad mínima">
            <input id="min_age" name="min_age" type="number" min={0} max={99} className="s-input" defaultValue={18} />
          </Field>
        </div>
      </section>

      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 14 }}>Políticas</p>
        <Field id="refund_policy" label="Política de devolución (texto visible al comprador)">
          <textarea
            id="refund_policy"
            name="refund_policy"
            rows={2}
            className="s-input"
            defaultValue="Sin devolución post-pago salvo cancelación del evento."
          />
        </Field>
      </section>

      {state.message && !state.ok && <p className="s-banner s-banner--err">{state.message}</p>}

      <div className="s-form-actions">
        <SubmitButton />
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="s-label">
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
      {hint && <p className="s-hint">{hint}</p>}
      {error && <p className="s-err">{error}</p>}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--primary s-btn--lg" disabled={pending}>
      {pending ? 'Creando…' : 'Crear evento'}
    </button>
  );
}
