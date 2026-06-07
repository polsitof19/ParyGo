'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { updateBrandSettingsAction, type SettingsState } from './actions';

const initial: SettingsState = { ok: false, message: null };

type Props = {
  contactEmail: string;
  whatsapp: string;
  yapeNumber: string;
  yapeHolder: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
};

export function SettingsForm(props: Props) {
  const [state, action] = useFormState(updateBrandSettingsAction, initial);
  const [primary, setPrimary] = useState(props.primaryColor);
  const [secondary, setSecondary] = useState(props.secondaryColor);
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="s-stack" style={{ gap: 16 }}>
      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 14 }}>Contacto</p>
        <Field label="Email de contacto" htmlFor="contact_email" error={err.contact_email}>
          <input id="contact_email" name="contact_email" type="email" defaultValue={props.contactEmail} placeholder="contacto@tumarca.com" className="s-input" />
        </Field>
        <div className="s-field">
          <Field label="WhatsApp (formato +51999000111)" htmlFor="whatsapp_e164" error={err.whatsapp_e164}>
            <input id="whatsapp_e164" name="whatsapp_e164" type="tel" inputMode="tel" pattern="^\+\d{8,15}$" defaultValue={props.whatsapp} placeholder="+51999000111" className="s-input" />
          </Field>
        </div>
      </section>

      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 6 }}>Cobro Yape</p>
        <p className="s-card__desc" style={{ marginBottom: 14 }}>Estos datos los ven tus compradores al pagar. Cambian al instante en tu página pública.</p>
        <Field label="Número de Yape" htmlFor="yape_number" error={err.yape_number}>
          <input id="yape_number" name="yape_number" defaultValue={props.yapeNumber} placeholder="999000111" className="s-input" />
        </Field>
        <div className="s-field">
          <Field label="Titular de la cuenta" htmlFor="yape_holder" error={err.yape_holder}>
            <input id="yape_holder" name="yape_holder" defaultValue={props.yapeHolder} placeholder="Tu Marca SAC" className="s-input" />
          </Field>
        </div>
      </section>

      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 14 }}>Marca visual</p>
        <Field label="Logo (PNG, JPG, WEBP o SVG · máx 2MB)" htmlFor="logo" error={err.logo}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {props.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.logoUrl} alt="logo actual" style={{ height: 48, width: 48, borderRadius: '50%', border: '1px solid var(--cream-3)', objectFit: 'cover' }} />
            ) : (
              <span className="s-avatar" style={{ background: 'var(--cream-2)', color: 'var(--ink-3)', fontSize: 10 }}>—</span>
            )}
            <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="s-input" style={{ paddingTop: 9 }} />
          </div>
        </Field>

        <div className="s-form-grid s-field">
          <Field label="Color primario" htmlFor="primary_color" error={err.primary_color}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" name="primary_color" id="primary_color" value={primary} onChange={(e) => setPrimary(e.target.value)} style={{ height: 40, width: 56, cursor: 'pointer', borderRadius: 8, border: '1px solid var(--cream-3)', background: 'transparent' }} />
              <span className="s-muted" style={{ fontSize: 13 }}>{primary}</span>
            </div>
          </Field>
          <Field label="Color secundario" htmlFor="secondary_color" error={err.secondary_color}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" name="secondary_color" id="secondary_color" value={secondary} onChange={(e) => setSecondary(e.target.value)} style={{ height: 40, width: 56, cursor: 'pointer', borderRadius: 8, border: '1px solid var(--cream-3)', background: 'transparent' }} />
              <span className="s-muted" style={{ fontSize: 13 }}>{secondary}</span>
            </div>
          </Field>
        </div>

        <div className="s-field">
          <p className="s-label">Vista previa</p>
          <div className="a-color-prev" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }} />
        </div>
      </section>

      {state.message && <p className={state.ok ? 's-banner s-banner--ok' : 's-banner s-banner--err'}>{state.message}</p>}
      <div className="s-form-actions">
        <SubmitButton />
      </div>
    </form>
  );
}

function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="s-label">{label}</label>
      {children}
      {error && <p className="s-err">{error}</p>}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--primary s-btn--lg" disabled={pending}>
      {pending ? 'Guardando…' : 'Guardar configuración'}
    </button>
  );
}
