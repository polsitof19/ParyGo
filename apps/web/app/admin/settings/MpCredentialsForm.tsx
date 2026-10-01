'use client';

import { useFormStatus } from 'react-dom';
import { useFormFeedback } from '@/components/useFormFeedback';
import { useTextos } from '@/components/IdiomaPanel';
import { updateMpCredentialsAction, type SettingsState } from './actions';

const initial: SettingsState = { ok: false, message: null };

type Props = {
  hasAccessToken: boolean;
  hasPublicKey: boolean;
  readOnly?: boolean;
};

export function MpCredentialsForm({ hasAccessToken, hasPublicKey, readOnly = false }: Props) {
  const [state, action] = useFormFeedback(updateMpCredentialsAction, initial);
  const { t } = useTextos();
  const err = state.fieldErrors ?? {};
  const configured = hasAccessToken && hasPublicKey;

  return (
    // Va dentro del pliegue "Tarjeta con Mercado Pago (próximamente)" de Mi
    // marca: el título lo pone el pliegue. MP por marca está diferido, así
    // que acá no se promete que cobre (2026-10-01).
    <section>
      <p className="s-card__desc" style={{ marginBottom: 12 }}>
        <span className={`a-flag ${configured ? 'a-flag--on' : 'a-flag--off'}`} style={{ marginRight: 8 }}>
          {configured ? t('Configurado', 'Configured') : t('No configurado', 'Not configured')}
        </span>
        {t('Todavía no está listo para cobrar. Por ahora tus compradores te pagan con Yape; te avisamos cuando puedas conectar tu cuenta de Mercado Pago.', 'It is not ready to take payments yet. For now your buyers pay you with Yape; we will let you know when you can connect your Mercado Pago account.')}
      </p>

      {/* .s-details en vez de una caja beige con borde y radio: era el último
          rectángulo cerrado del panel, y su summary medía 20px de alto (por
          debajo del mínimo para tocarlo). */}
      {!configured && !readOnly && (
        <details className="s-details" style={{ marginBottom: 14 }}>
          <summary>{t('¿Cómo consigo mis credenciales?', 'How do I get my credentials?')}</summary>
          <ol style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
            <li>{t('Entra a tu', 'Go to your')} <a href="https://www.mercadopago.com.pe/developers/panel/app" target="_blank" rel="noopener noreferrer" className="s-textlink" style={{ fontWeight: 600 }}>{t('panel de desarrolladores de MercadoPago', 'MercadoPago developer panel')}</a> {t('con la cuenta donde quieres recibir la plata.', 'with the account where you want to receive the money.')}</li>
            <li>{t('Crea una aplicación (o usa una existente) y abre', 'Create an application (or use an existing one) and open')} <strong>{t('Credenciales de producción', 'Production credentials')}</strong>.</li>
            <li>{t('Copia el', 'Copy the')} <strong>Access Token</strong> {t('y la', 'and the')} <strong>Public Key</strong> ({t('empiezan con', 'they start with')} <code>APP_USR-</code>) {t('y pégalos aquí abajo.', 'and paste them below.')}</li>
          </ol>
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--ink-3)' }}>{t('Validamos las credenciales con MercadoPago antes de guardar, así sabes al toque si están bien.', 'We validate the credentials with MercadoPago before saving, so you know right away if they are correct.')}</p>
        </details>
      )}

      <form action={action} className="s-stack" style={{ gap: 14 }}>
        <input type="hidden" name="intent" value="save" />
        <Field label={t('Access Token (APP_USR-… o TEST-…)', 'Access Token (APP_USR-… or TEST-…)')} htmlFor="mp_access_token" error={err.mp_access_token}>
          <input id="mp_access_token" name="mp_access_token" type="password" autoComplete="off" className="s-input" disabled={readOnly}
            placeholder={hasAccessToken ? t('•••••••••• (ya cargado — pega uno nuevo para reemplazar)', '•••••••••• (already saved — paste a new one to replace it)') : 'APP_USR-0000000000000000-...'} />
        </Field>
        <Field label="Public Key" htmlFor="mp_public_key" error={err.mp_public_key}>
          <input id="mp_public_key" name="mp_public_key" type="password" autoComplete="off" className="s-input" disabled={readOnly}
            placeholder={hasPublicKey ? t('•••••••••• (ya cargada — pega una nueva para reemplazar)', '•••••••••• (already saved — paste a new one to replace it)') : 'APP_USR-xxxxxxxx-...'} />
        </Field>

        {state.message && <p className={state.ok ? 's-banner s-banner--ok' : 's-banner s-banner--err'}>{state.message}</p>}

        {readOnly ? (
          <p className="s-card__desc">{t('Solo lectura — no puedes cargar ni quitar credenciales desde aquí.', 'Read only — you cannot add or remove credentials from here.')}</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <SaveButton />
            {configured && <RemoveButton formAction={action} />}
          </div>
        )}
      </form>
    </section>
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

function SaveButton() {
  const { pending } = useFormStatus();
  const { t } = useTextos();
  return (
    <button type="submit" className="s-btn s-btn--primary s-btn--lg" disabled={pending}>
      {pending ? t('Validando con MercadoPago…', 'Validating with MercadoPago…') : t('Validar y guardar', 'Validate and save')}
    </button>
  );
}

function RemoveButton({ formAction }: { formAction: (payload: FormData) => void }) {
  const { pending } = useFormStatus();
  const { t } = useTextos();
  return (
    <button
      type="submit"
      className="s-btn s-btn--ghost s-btn--lg"
      disabled={pending}
      formAction={(fd) => {
        fd.set('intent', 'remove');
        formAction(fd);
      }}
    >
      {t('Quitar credenciales', 'Remove credentials')}
    </button>
  );
}
