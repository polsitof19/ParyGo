'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Eye, EyeOff } from 'lucide-react';
import { createBrandWithOwnerAction, type FormState } from './actions';
import { BrandingFields } from '../BrandingFields';

const initial: FormState = { ok: false, message: null, fieldErrors: {} };

// Misma normalización que el slug regex del server: minúsculas, números, guiones.
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function CreateBrandForm({ requestId, initialName = '', initialEmail = '' }: { requestId?: string; initialName?: string; initialEmail?: string } = {}) {
  const [state, action] = useFormState(createBrandWithOwnerAction, initial);
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(() => slugify(initialName));
  const [showPwd, setShowPwd] = useState(false);
  // El slug sigue al nombre hasta que el usuario lo edita a mano.
  const slugTouched = useRef(false);

  useEffect(() => {
    if (!slugTouched.current) setSlug(slugify(name));
  }, [name]);

  return (
    <form action={action} className="s-card s-card--lg">
      {requestId && <input type="hidden" name="request_id" value={requestId} />}
      <div className="s-field">
        <label htmlFor="name" className="s-label">Nombre de la marca <span className="req">*</span></label>
        <input
          id="name"
          name="name"
          className="s-input"
          placeholder="Code"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
        {state.fieldErrors?.name && <p className="s-err">{state.fieldErrors.name}</p>}
      </div>

      <div className="s-field">
        <label htmlFor="slug" className="s-label">Subdominio <span className="req">*</span></label>
        <div className="s-slug-wrap">
          <input
            id="slug"
            name="slug"
            className="s-input"
            placeholder="code"
            pattern="^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$"
            required
            value={slug}
            onChange={(e) => {
              slugTouched.current = true;
              setSlug(slugify(e.target.value));
            }}
            autoComplete="off"
          />
          <span className="s-slug-suffix">.parygo.com</span>
        </div>
        <p className="s-hint">Se genera del nombre. Podés editarlo: solo minúsculas, números y guiones.</p>
        {state.fieldErrors?.slug && <p className="s-err">{state.fieldErrors.slug}</p>}
      </div>

      <div className="s-divider" />
      <p className="s-section-lead">Dueño de la marca</p>

      <div className="s-field">
        <label htmlFor="owner_email" className="s-label">Email del dueño <span className="req">*</span></label>
        <input
          id="owner_email"
          name="owner_email"
          type="email"
          className="s-input"
          placeholder="promotor@code.com.pe"
          required
          defaultValue={initialEmail}
          autoComplete="off"
        />
        <p className="s-hint">Con este email y la contraseña entra a su panel.</p>
        {state.fieldErrors?.owner_email && <p className="s-err">{state.fieldErrors.owner_email}</p>}
      </div>

      <div className="s-field">
        <label htmlFor="owner_password" className="s-label">Contraseña <span className="req">*</span></label>
        <div className="s-pwrap">
          <input
            id="owner_password"
            name="owner_password"
            type={showPwd ? 'text' : 'password'}
            className="s-input"
            placeholder="mínimo 8 caracteres"
            minLength={8}
            required
            autoComplete="new-password"
          />
          <button
            type="button"
            className="s-peek"
            onClick={() => setShowPwd((v) => !v)}
            aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="s-hint">La fijás vos y se la pasás al promotor.</p>
        {state.fieldErrors?.owner_password && <p className="s-err">{state.fieldErrors.owner_password}</p>}
      </div>

      <div className="s-divider" />
      <p className="s-section-lead">Marca visual (opcional)</p>
      <p className="s-hint" style={{ marginTop: 2, marginBottom: 12 }}>
        Si no cargás logo ni color, la marca usa los valores por defecto (los puede cambiar después el dueño o vos).
      </p>
      <BrandingFields defaultColor="#FF1F8F" />
      {state.fieldErrors?.logo && <p className="s-err">{state.fieldErrors.logo}</p>}
      {state.fieldErrors?.primary_color && <p className="s-err">{state.fieldErrors.primary_color}</p>}

      {state.message && !state.ok && <p className="s-banner s-banner--err" style={{ marginTop: 18 }}>{state.message}</p>}

      <div className="s-form-actions">
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--primary s-btn--lg" disabled={pending}>
      {pending ? 'Creando…' : 'Crear marca y dueño'}
    </button>
  );
}
