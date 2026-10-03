'use client';

import { useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { utcALocal, zonaDe } from '@/lib/zona';
import { createEventAction, type FormState } from './actions';

// El slug sale del nombre mientras no lo toquen (misma regla que el asistente del panel).
const aSlug = (n: string): string => n
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  .slice(0, 42).replace(/-+$/g, '');

const initial: FormState = { ok: false, message: null, fieldErrors: {} };

type Brand = { id: string; slug: string; name: string; zona_horaria: string };


export function NewEventForm({
  brands,
  preselectedSlug,
}: {
  brands: Brand[];
  preselectedSlug: string | null;
}) {
  const [state, action] = useFormState(createEventAction, initial);
  const preselected = brands.find((b) => b.slug === preselectedSlug);
  // El min del datetime-local es "ahora" en la hora de la marca elegida.
  const [brandId, setBrandId] = useState(preselected?.id ?? '');
  const [slug, setSlug] = useState('');
  const slugManual = useRef(false);
  const minDateTime = utcALocal(new Date(), zonaDe(brands.find((b) => b.id === brandId)?.zona_horaria));

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
            onChange={(e) => setBrandId(e.target.value)}
            className="s-input s-select"
          >
            <option value="" disabled>Elige marca</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.slug})</option>
            ))}
          </select>
        </Field>
      </section>

      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 14 }}>Evento</p>
        <Field id="name" label="Nombre del evento" required error={state.fieldErrors?.name}>
          <input id="name" name="name" className="s-input" required onChange={(e) => { if (!slugManual.current) setSlug(aSlug(e.target.value)); }} />
        </Field>
        <div className="s-field">
          <Field id="slug" label="Slug" hint="Es la dirección del evento: <marca>.parygo.com/<slug>. Se arma sola desde el nombre." required error={state.fieldErrors?.slug}>
            <input id="slug" name="slug" className="s-input" value={slug} onChange={(e) => { slugManual.current = true; setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }} pattern="^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$" required />
          </Field>
        </div>
        <div className="s-field">
          <Field id="description" label="Descripción corta">
            <textarea id="description" name="description" rows={3} className="s-input" />
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
          <input id="venue_name" name="venue_name" className="s-input" />
        </Field>
        <div className="s-field">
          <Field id="venue_address" label="Dirección">
            <input id="venue_address" name="venue_address" className="s-input" />
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
