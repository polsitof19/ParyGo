'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
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
  yapeQrUrl: string | null;
  notifyYapeRecovery: boolean;
  notifyYapeDigest: boolean;
  readOnly?: boolean;
};

export function SettingsForm(props: Props) {
  const [state, action] = useFormState(updateBrandSettingsAction, initial);
  const [primary, setPrimary] = useState(props.primaryColor);
  const [secondary, setSecondary] = useState(props.secondaryColor);
  const err = state.fieldErrors ?? {};
  const ro = Boolean(props.readOnly);
  // Feedback inmediato en mobile: el Banner al pie suele quedar fuera de viewport.
  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state.ok, state.message]);

  return (
    <form action={action} className="s-stack" style={{ gap: 16 }}>
      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 14 }}>Contacto</p>
        <Field label="Email de contacto" htmlFor="contact_email" error={err.contact_email}>
          <input id="contact_email" name="contact_email" type="email" defaultValue={props.contactEmail} placeholder="contacto@tumarca.com" className="s-input" disabled={ro} />
        </Field>
        <div className="s-field">
          <Field label="WhatsApp (formato +51999000111)" htmlFor="whatsapp_e164" error={err.whatsapp_e164}>
            <input id="whatsapp_e164" name="whatsapp_e164" type="tel" inputMode="tel" pattern="^\+\d{8,15}$" defaultValue={props.whatsapp} placeholder="+51999000111" className="s-input" disabled={ro} />
          </Field>
        </div>
      </section>

      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 6 }}>Cobro Yape</p>
        <p className="s-card__desc" style={{ marginBottom: 14 }}>Estos datos los ven tus compradores al pagar. Cambian al instante en tu página pública.</p>
        <Field label="Número de Yape" htmlFor="yape_number" error={err.yape_number}>
          <input id="yape_number" name="yape_number" defaultValue={props.yapeNumber} placeholder="999000111" className="s-input" disabled={ro} />
        </Field>
        <div className="s-field">
          <Field label="Titular de la cuenta" htmlFor="yape_holder" error={err.yape_holder}>
            <input id="yape_holder" name="yape_holder" defaultValue={props.yapeHolder} placeholder="Tu Marca SAC" className="s-input" disabled={ro} />
          </Field>
        </div>
        <div className="s-field">
          <Field label="QR de Yape (PNG, JPG o WEBP · máx 2MB · opcional)" htmlFor="yape_qr" error={err.yape_qr}>
            <p className="s-card__desc" style={{ marginBottom: 8 }}>Si lo subís, tus compradores lo ven en el paso de pago y escanean directo desde su Yape.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {props.yapeQrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={props.yapeQrUrl} alt="QR de Yape actual" style={{ height: 64, width: 64, borderRadius: 10, border: '1px solid var(--cream-3)', objectFit: 'cover' }} />
              ) : (
                <span className="s-avatar" style={{ background: 'var(--cream-2)', color: 'var(--ink-3)', fontSize: 10, borderRadius: 10 }}>QR</span>
              )}
              <input id="yape_qr" name="yape_qr" type="file" accept="image/png,image/jpeg,image/webp" className="s-input" style={{ paddingTop: 9 }} disabled={ro} />
            </div>
            {props.yapeQrUrl && !ro && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13, color: 'var(--ink-2)' }}>
                <input type="checkbox" name="remove_yape_qr" value="1" /> Quitar el QR actual
              </label>
            )}
          </Field>
        </div>
      </section>

      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 14 }}>Marca visual</p>
        <Field label="Logo (PNG, JPG o WEBP · máx 2MB)" htmlFor="logo" error={err.logo}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {props.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.logoUrl} alt="logo actual" style={{ height: 48, width: 48, borderRadius: '50%', border: '1px solid var(--cream-3)', objectFit: 'cover' }} />
            ) : (
              <span className="s-avatar" style={{ background: 'var(--cream-2)', color: 'var(--ink-3)', fontSize: 10 }}>—</span>
            )}
            <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="s-input" style={{ paddingTop: 9 }} disabled={ro} />
          </div>
        </Field>

        <div className="s-form-grid s-field">
          <Field label="Color primario" htmlFor="primary_color" error={err.primary_color}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" name="primary_color" id="primary_color" value={primary} onChange={(e) => setPrimary(e.target.value)} disabled={ro} style={{ height: 40, width: 56, cursor: ro ? 'default' : 'pointer', borderRadius: 8, border: '1px solid var(--cream-3)', background: 'transparent' }} />
              <span className="s-muted" style={{ fontSize: 13 }}>{primary}</span>
            </div>
          </Field>
          <Field label="Color secundario" htmlFor="secondary_color" error={err.secondary_color}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" name="secondary_color" id="secondary_color" value={secondary} onChange={(e) => setSecondary(e.target.value)} disabled={ro} style={{ height: 40, width: 56, cursor: ro ? 'default' : 'pointer', borderRadius: 8, border: '1px solid var(--cream-3)', background: 'transparent' }} />
              <span className="s-muted" style={{ fontSize: 13 }}>{secondary}</span>
            </div>
          </Field>
        </div>

        <div className="s-field">
          <p className="s-label">Vista previa</p>
          <div className="a-color-prev" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }} />
        </div>
      </section>

      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 6 }}>Avisos por email de Yape</p>
        <p className="s-card__desc" style={{ marginBottom: 14 }}>Recordatorios automáticos por email. No cambian cómo aprobás los Yapes — solo avisan/recuerdan. Desactivados por defecto.</p>
        <label className="s-check" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 12 }}>
          <input type="checkbox" name="notify_yape_recovery" defaultChecked={props.notifyYapeRecovery} disabled={ro} style={{ marginTop: 3 }} />
          <span>
            <strong>Recordar a los compradores con Yape a medias</strong>
            <span className="s-muted" style={{ display: 'block', fontSize: 13 }}>Si alguien empezó la compra pero no subió su comprobante, le mandamos un recordatorio con el link para completarla.</span>
          </span>
        </label>
        <label className="s-check" style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
          <input type="checkbox" name="notify_yape_digest" defaultChecked={props.notifyYapeDigest} disabled={ro} style={{ marginTop: 3 }} />
          <span>
            <strong>Avisarme cuando tengo Yapes por aprobar</strong>
            <span className="s-muted" style={{ display: 'block', fontSize: 13 }}>Te llega un email a tu correo de contacto cuando hay comprobantes esperando tu revisión.</span>
          </span>
        </label>
      </section>

      {state.message && <p className={state.ok ? 's-banner s-banner--ok' : 's-banner s-banner--err'}>{state.message}</p>}
      {!ro && (
        <div className="s-form-actions">
          <SubmitButton />
        </div>
      )}
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
