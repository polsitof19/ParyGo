'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useFormFeedback } from '@/components/useFormFeedback';
import { updateBrandSettingsAction, type SettingsState } from './actions';
import { BrandLogo } from '@/components/BrandLogo';
import { useTextos } from '@/components/IdiomaPanel';

const initial: SettingsState = { ok: false, message: null };

// Todos los campos de esta pantalla van a UN formulario (la action guarda la
// fila entera de la marca). El <form> vive al pie, con el botón, y los campos
// se asocian con form={FORM}: así "Cómo te pagan" puede ir arriba, las
// credenciales de Mercado Pago (que son OTRO formulario) en el medio sin
// anidar formularios, y el botón queda pegado abajo en el teléfono.
const FORM = 'mi-marca-form';

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
  /** Mercado Pago plegado, dentro de "Cómo te pagan" (su propio formulario). */
  tarjeta?: React.ReactNode;
  /** Pliegues que no son de este formulario: tema, equipo, idioma. */
  despues?: React.ReactNode;
  /** Va entre "Marca visual" y "Avisos". */
  tema?: React.ReactNode;
};

// 987654321 → 987 654 321
const fmtYape = (n: string) => n.replace(/\D/g, '').replace(/(\d{3})(?=\d)/g, '$1 ');

export function SettingsForm(props: Props) {
  const [state, action] = useFormFeedback(updateBrandSettingsAction, initial);
  const [primary, setPrimary] = useState(props.primaryColor);
  const [secondary, setSecondary] = useState(props.secondaryColor);
  const { t } = useTextos();
  const err = state.fieldErrors ?? {};
  const ro = Boolean(props.readOnly);
  const listo = Boolean(props.yapeNumber);
  // Un pliegue con un error adentro se abre: si no, el error no se ve.
  const abierto = (...k: string[]) => (k.some((x) => err[x]) ? true : undefined);

  return (
    <>
      <section id="cobro" className="a-cobro" aria-labelledby="cobro-title">
        <h2 id="cobro-title" className="s-h2">{t('Cómo te pagan', 'How you get paid')}</h2>
        <p className={`s-calm a-cobro__estado ${listo ? 's-calm--ok' : 'a-cobro__estado--falta'}`} role="status">
          {listo
            ? <span>{t('Listo: tus compradores te pagan con Yape al', 'Ready: your buyers pay you with Yape at')} <span style={{ whiteSpace: 'nowrap' }}>{fmtYape(props.yapeNumber)}</span></span>
            : t('Falta: sin un método de pago nadie puede pagarte', 'Missing: without a payment method nobody can pay you')}
        </p>

        <h3 className="a-cobro__op">{t('Yape (Perú)', 'Yape (Peru)')}</h3>
        <div className="s-form-grid">
          <Field label={t('Número de Yape', 'Yape number')} htmlFor="yape_number" error={err.yape_number}>
            <input form={FORM} id="yape_number" name="yape_number" type="tel" inputMode="numeric" autoComplete="off" defaultValue={props.yapeNumber} placeholder={t('Celular de 9 dígitos', '9-digit mobile number')} className="s-input" disabled={ro} />
          </Field>
          <Field label={t('Titular', 'Holder')} htmlFor="yape_holder" error={err.yape_holder}>
            <input form={FORM} id="yape_holder" name="yape_holder" defaultValue={props.yapeHolder} placeholder={t('Nombre que figura en tu Yape', 'Name shown on your Yape')} className="s-input" disabled={ro} />
          </Field>
        </div>
        <div className="s-field">
          <Field label={t('QR de Yape (opcional)', 'Yape QR (optional)')} htmlFor="yape_qr" error={err.yape_qr}>
            <div className="s-file">
              {props.yapeQrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={props.yapeQrUrl} alt={t('QR de Yape actual', 'Current Yape QR')} className="a-cobro__qr" />
              ) : (
                <span className="s-avatar" style={{ background: 'var(--paper-2)', color: 'var(--ink-3)', fontSize: 10, borderRadius: 10 }}>QR</span>
              )}
              <ArchivoInput id="yape_qr" nombre="yape_qr" tieneActual={Boolean(props.yapeQrUrl)} deshabilitado={ro} />
            </div>
            <p className="s-hint">{t('El que descargas de tu app Yape. Tus compradores lo escanean en vez de tipear el número. PNG, JPG o WEBP · máx 2 MB.', 'The one you download from your Yape app. Buyers scan it instead of typing the number. PNG, JPG or WEBP · max 2 MB.')}</p>
            {props.yapeQrUrl && !ro && (
              <label className="s-check" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                <input form={FORM} type="checkbox" name="remove_yape_qr" value="1" /> {t('Quitar el QR actual', 'Remove current QR')}
              </label>
            )}
          </Field>
        </div>

        {props.tarjeta}
      </section>

      <div className="s-folds a-marca-folds">
        <details className="s-fold" open={abierto('contact_email', 'whatsapp_e164', 'instagram')}>
          <summary>
            <span className="s-fold__t">
              {t('Contacto', 'Contact')}
              <span className="s-fold__hint">{props.contactEmail || props.whatsapp || t('Sin datos de contacto', 'No contact details')}</span>
            </span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="s-fold__body">
            <Field label={t('Email de contacto', 'Contact email')} htmlFor="contact_email" error={err.contact_email}>
              <input form={FORM} id="contact_email" name="contact_email" type="email" defaultValue={props.contactEmail} placeholder={t('contacto@tumarca.com', 'contact@yourbrand.com')} className="s-input" disabled={ro} />
              <p className="s-hint">{t('Es tu contacto público: lo ven los compradores en la página del evento, al pagar y en la entrada, y es la dirección a la que le responden a tus emails. No es tu email para entrar al panel.', 'This is your public contact: buyers see it on the event page, at checkout and on the ticket, and it is the address they reply to on your emails. It is not your email to log in to the dashboard.')}</p>
            </Field>
            <div className="s-field">
              <Field label={t('WhatsApp (formato +51999000111)', 'WhatsApp (format +51999000111)')} htmlFor="whatsapp_e164" error={err.whatsapp_e164}>
                <input form={FORM} id="whatsapp_e164" name="whatsapp_e164" type="tel" inputMode="tel" defaultValue={props.whatsapp} placeholder="+51999000111" className="s-input" disabled={ro} />
              </Field>
            </div>
            <div className="s-field">
              <Field label={t('Instagram (usuario o link)', 'Instagram (username or link)')} htmlFor="instagram" error={err.instagram}>
                <input form={FORM} id="instagram" name="instagram" defaultValue={props.instagram} placeholder={t('@tumarca', '@yourbrand')} className="s-input" disabled={ro} />
              </Field>
              <p className="s-hint">{t('Aparece en tu página pública. Puedes poner @usuario o el link completo.', 'It appears on your public page. You can enter @username or the full link.')}</p>
            </div>
          </div>
        </details>

        <details className="s-fold" open={abierto('logo', 'primary_color', 'secondary_color')}>
          <summary>
            <span className="s-fold__t">
              {t('Marca visual', 'Visual brand')}
              <span className="s-fold__hint">{props.logoUrl ? t('Con logo', 'With logo') : t('Sin logo', 'No logo')} · {props.primaryColor.toUpperCase()}</span>
            </span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="s-fold__body">
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
                  <input form={FORM} type="color" name="primary_color" id="primary_color" value={primary} onChange={(e) => setPrimary(e.target.value)} disabled={ro} className="s-colorpick" />
                  <span className="s-muted" style={{ fontSize: 13 }}>{primary}</span>
                </div>
              </Field>
              <Field label={t('Color secundario', 'Secondary color')} htmlFor="secondary_color" error={err.secondary_color}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input form={FORM} type="color" name="secondary_color" id="secondary_color" value={secondary} onChange={(e) => setSecondary(e.target.value)} disabled={ro} className="s-colorpick" />
                  <span className="s-muted" style={{ fontSize: 13 }}>{secondary}</span>
                </div>
              </Field>
            </div>
            <div className="s-field">
              <p className="s-label">{t('Vista previa', 'Preview')}</p>
              <div className="a-color-prev" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }} />
            </div>
          </div>
        </details>

        {props.tema}

        <details className="s-fold">
          <summary>
            <span className="s-fold__t">
              {t('Avisos por email de Yape', 'Yape email notifications')}
              <span className="s-fold__hint">
                {props.notifyYapeRecovery || props.notifyYapeDigest
                  ? [props.notifyYapeDigest && t('Yapes por aprobar', 'Yapes to approve'), props.notifyYapeRecovery && t('recordatorio al comprador', 'buyer reminder')].filter(Boolean).join(' · ')
                  : t('Apagados', 'Off')}
              </span>
            </span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="s-fold__body">
            <p className="s-card__desc" style={{ marginBottom: 14 }}>{t('Recordatorios automáticos por email. No cambian cómo apruebas los Yapes: solo avisan y recuerdan.', 'Automatic email reminders. They don’t change how you approve Yapes: they only notify and remind.')}</p>
            <label className="s-check" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 12 }}>
              <input form={FORM} type="checkbox" name="notify_yape_recovery" defaultChecked={props.notifyYapeRecovery} disabled={ro} style={{ marginTop: 3 }} />
              <span>
                <strong>{t('Recordar a los compradores con Yape a medias', 'Remind buyers with a half-finished Yape')}</strong>
                <span className="s-muted" style={{ display: 'block', fontSize: 13 }}>{t('Si alguien empezó la compra pero no subió su comprobante, le mandamos un recordatorio con el link para completarla.', 'If someone started the purchase but didn’t upload their receipt, we send them a reminder with the link to finish it.')}</span>
              </span>
            </label>
            <label className="s-check" style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <input form={FORM} type="checkbox" name="notify_yape_digest" defaultChecked={props.notifyYapeDigest} disabled={ro} style={{ marginTop: 3 }} />
              <span>
                <strong>{t('Avisarme cuando tengo Yapes por aprobar', 'Notify me when I have Yapes to approve')}</strong>
                <span className="s-muted" style={{ display: 'block', fontSize: 13 }}>{t('Te llega un email a tu correo de contacto apenas un comprador sube su comprobante, con el botón para revisarlo.', 'You get an email at your contact address as soon as a buyer uploads their receipt, with a button to review it.')}</span>
              </span>
            </label>
          </div>
        </details>

        {props.despues}
      </div>

      {/* El formulario: solo el resultado y el botón. noValidate: un campo
          inválido dentro de un pliegue cerrado no se puede enfocar y el
          navegador cortaría el envío sin decir nada; valida el servidor, que
          devuelve el error y abre ese pliegue. */}
      {!ro && (
        <form id={FORM} action={action} noValidate className="a-savebar">
          {state.message && !state.ok && <p className="s-banner s-banner--err">{state.message}</p>}
          <SubmitButton />
        </form>
      )}
    </>
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
        form={FORM}
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
