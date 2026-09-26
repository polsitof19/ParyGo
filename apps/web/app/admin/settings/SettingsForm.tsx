'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useFormFeedback } from '@/components/useFormFeedback';
import { updateBrandSettingsAction, type SettingsState } from './actions';
import { BrandLogo } from '@/components/BrandLogo';
import { useTextos } from '@/components/IdiomaPanel';

const initial: SettingsState = { ok: false, message: null };

type Props = {
  contactEmail: string;
  whatsapp: string;
  instagram: string;
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
  const [state, action] = useFormFeedback(updateBrandSettingsAction, initial);
  const [primary, setPrimary] = useState(props.primaryColor);
  const [secondary, setSecondary] = useState(props.secondaryColor);
  const { t } = useTextos();
  const err = state.fieldErrors ?? {};
  const ro = Boolean(props.readOnly);
  // El toast de resultado (también en mobile, donde el Banner queda fuera de
  // viewport) lo dispara useFormFeedback.

  return (
    <form action={action} className="s-stack" style={{ gap: 16 }}>
      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 14 }}>{t('Contacto', 'Contact')}</p>
        <Field label={t('Email de contacto', 'Contact email')} htmlFor="contact_email" error={err.contact_email}>
          <input id="contact_email" name="contact_email" type="email" defaultValue={props.contactEmail} placeholder={t('contacto@tumarca.com', 'contact@yourbrand.com')} className="s-input" disabled={ro} />
          <p className="s-hint">{t('Es tu contacto público: lo ven los compradores en la página del evento, al pagar y en la entrada, y es la dirección a la que le responden a tus emails. No es tu email para entrar al panel.', 'This is your public contact: buyers see it on the event page, at checkout and on the ticket, and it is the address they reply to on your emails. It is not your email to log in to the dashboard.')}</p>
        </Field>
        <div className="s-field">
          <Field label={t('WhatsApp (formato +51999000111)', 'WhatsApp (format +51999000111)')} htmlFor="whatsapp_e164" error={err.whatsapp_e164}>
            <input id="whatsapp_e164" name="whatsapp_e164" type="tel" inputMode="tel" pattern="^\+\d{8,15}$" defaultValue={props.whatsapp} placeholder="+51999000111" className="s-input" disabled={ro} />
          </Field>
        </div>
        <div className="s-field">
          <Field label={t('Instagram (usuario o link)', 'Instagram (username or link)')} htmlFor="instagram" error={err.instagram}>
            <input id="instagram" name="instagram" defaultValue={props.instagram} placeholder={t('@tumarca', '@yourbrand')} className="s-input" disabled={ro} />
          </Field>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t('Aparece en tu página pública. Puedes poner @usuario o el link completo.', 'It appears on your public page. You can enter @username or the full link.')}</p>
        </div>
      </section>

      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 6 }}>{t('Cobro Yape', 'Yape payments')}</p>
        <p className="s-card__desc" style={{ marginBottom: 14 }}>{t('Estos datos los ven tus compradores al pagar. Cambian al instante en tu página pública.', 'Buyers see this information when paying. It updates instantly on your public page.')}</p>
        <Field label={t('Número de Yape', 'Yape number')} htmlFor="yape_number" error={err.yape_number}>
          <input id="yape_number" name="yape_number" type="tel" inputMode="numeric" autoComplete="off" defaultValue={props.yapeNumber} placeholder="999000111" className="s-input" disabled={ro} />
        </Field>
        <div className="s-field">
          <Field label={t('Titular de la cuenta', 'Account holder')} htmlFor="yape_holder" error={err.yape_holder}>
            <input id="yape_holder" name="yape_holder" defaultValue={props.yapeHolder} placeholder={t('Tu Marca SAC', 'Your Brand SAC')} className="s-input" disabled={ro} />
          </Field>
        </div>
        <div className="s-field">
          <Field label={t('QR de Yape (opcional)', 'Yape QR (optional)')} htmlFor="yape_qr" error={err.yape_qr}>
            <p className="s-hint" style={{ marginTop: 0, marginBottom: 10 }}>
              {t('Sube el QR que descargas de tu app Yape. Tus compradores lo escanean en vez de tipear el número. Si no subes ninguno, siguen viendo «yapea al número», que funciona igual.', 'Upload the QR you download from your Yape app. Your buyers scan it instead of typing the number. If you don’t upload one, they still see “yapea al número”, which works the same way.')}
              <br />{t('PNG, JPG o WEBP · máx 2 MB.', 'PNG, JPG or WEBP · max 2 MB.')}
            </p>
            <p className="s-card__desc" style={{ marginBottom: 8 }}>{t('Si lo subes, tus compradores lo ven en el paso de pago y escanean directo desde su Yape.', 'If you upload it, your buyers see it at checkout and scan it directly from their Yape.')}</p>
            <div className="s-file">
              {props.yapeQrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={props.yapeQrUrl} alt={t('QR de Yape actual', 'Current Yape QR')} style={{ height: 64, width: 64, borderRadius: 10, border: '1px solid var(--line)', objectFit: 'cover' }} />
              ) : (
                <span className="s-avatar" style={{ background: 'var(--paper-2)', color: 'var(--ink-3)', fontSize: 10, borderRadius: 10 }}>QR</span>
              )}
              <ArchivoInput id="yape_qr" nombre="yape_qr" tieneActual={Boolean(props.yapeQrUrl)} deshabilitado={ro} />
            </div>
            {props.yapeQrUrl && !ro && (
              <label className="s-check" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                <input type="checkbox" name="remove_yape_qr" value="1" /> {t('Quitar el QR actual', 'Remove current QR')}
              </label>
            )}
          </Field>
        </div>
      </section>

      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 14 }}>{t('Marca visual', 'Visual brand')}</p>
        <Field label={t('Logo (PNG, JPG o WEBP · máx 2MB)', 'Logo (PNG, JPG or WEBP · max 2MB)')} htmlFor="logo" error={err.logo}>
          <div className="s-file">
            {props.logoUrl ? (
              <BrandLogo src={props.logoUrl} alt={t('logo actual', 'current logo')} size={48} ring={false} />
            ) : (
              <span className="s-avatar" style={{ background: 'var(--paper-2)', color: 'var(--ink-3)', fontSize: 10 }}>—</span>
            )}
            <ArchivoInput id="logo" nombre="logo" tieneActual={Boolean(props.logoUrl)} deshabilitado={ro} />
          </div>
        </Field>

        <div className="s-form-grid s-field">
          <Field label={t('Color primario', 'Primary color')} htmlFor="primary_color" error={err.primary_color}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" name="primary_color" id="primary_color" value={primary} onChange={(e) => setPrimary(e.target.value)} disabled={ro} className="s-colorpick" />
              <span className="s-muted" style={{ fontSize: 13 }}>{primary}</span>
            </div>
          </Field>
          <Field label={t('Color secundario', 'Secondary color')} htmlFor="secondary_color" error={err.secondary_color}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" name="secondary_color" id="secondary_color" value={secondary} onChange={(e) => setSecondary(e.target.value)} disabled={ro} className="s-colorpick" />
              <span className="s-muted" style={{ fontSize: 13 }}>{secondary}</span>
            </div>
          </Field>
        </div>

        <div className="s-field">
          <p className="s-label">{t('Vista previa', 'Preview')}</p>
          <div className="a-color-prev" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }} />
        </div>
      </section>

      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 6 }}>{t('Avisos por email de Yape', 'Yape email notifications')}</p>
        <p className="s-card__desc" style={{ marginBottom: 14 }}>{t('Recordatorios automáticos por email. No cambian cómo apruebas los Yapes: solo avisan y recuerdan.', 'Automatic email reminders. They don’t change how you approve Yapes: they only notify and remind.')}</p>
        <label className="s-check" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 12 }}>
          <input type="checkbox" name="notify_yape_recovery" defaultChecked={props.notifyYapeRecovery} disabled={ro} style={{ marginTop: 3 }} />
          <span>
            <strong>{t('Recordar a los compradores con Yape a medias', 'Remind buyers with a half-finished Yape')}</strong>
            <span className="s-muted" style={{ display: 'block', fontSize: 13 }}>{t('Si alguien empezó la compra pero no subió su comprobante, le mandamos un recordatorio con el link para completarla.', 'If someone started the purchase but didn’t upload their receipt, we send them a reminder with the link to finish it.')}</span>
          </span>
        </label>
        <label className="s-check" style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
          <input type="checkbox" name="notify_yape_digest" defaultChecked={props.notifyYapeDigest} disabled={ro} style={{ marginTop: 3 }} />
          <span>
            <strong>{t('Avisarme cuando tengo Yapes por aprobar', 'Notify me when I have Yapes to approve')}</strong>
            <span className="s-muted" style={{ display: 'block', fontSize: 13 }}>{t('Te llega un email a tu correo de contacto apenas un comprador sube su comprobante, con el botón para revisarlo.', 'You get an email at your contact address as soon as a buyer uploads their receipt, with a button to review it.')}</span>
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

// Campo de archivo del sistema: el input nativo queda escondido (sigue en el
// DOM, sigue enfocable y su <label> de caption sigue nombrándolo) y lo visible
// es un botón de texto más el nombre del archivo. El input[type=file] nativo
// dibujaba su propio botón gris "Choose File", sin traducir.
function ArchivoInput({ id, nombre, tieneActual, deshabilitado }: { id: string; nombre: string; tieneActual: boolean; deshabilitado: boolean }) {
  const [elegido, setElegido] = useState<string | null>(null);
  const { t } = useTextos();
  return (
    <>
      <input
        id={id}
        name={nombre}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="s-file__input"
        disabled={deshabilitado}
        onChange={(e) => setElegido(e.target.files?.[0]?.name ?? null)}
      />
      <label htmlFor={id} className="s-btn s-btn--soft s-btn--sm s-file__btn">
        {tieneActual ? t('Cambiar imagen', 'Change image') : t('Elegir imagen', 'Choose image')}
      </label>
      <span className="s-file__name">{elegido ?? (tieneActual ? t('La actual', 'The current one') : t('Ninguna elegida', 'None chosen'))}</span>
    </>
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
  const { t } = useTextos();
  return (
    <button type="submit" className="s-btn s-btn--primary s-btn--lg" disabled={pending}>
      {pending ? t('Guardando…', 'Saving…') : t('Guardar configuración', 'Save settings')}
    </button>
  );
}
