'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateMpCredentialsAction, type SettingsState } from './actions';

const initial: SettingsState = { ok: false, message: null };

type Props = {
  hasAccessToken: boolean;
  hasPublicKey: boolean;
  readOnly?: boolean;
};

export function MpCredentialsForm({ hasAccessToken, hasPublicKey, readOnly = false }: Props) {
  const [state, action] = useFormState(updateMpCredentialsAction, initial);
  const err = state.fieldErrors ?? {};
  const configured = hasAccessToken && hasPublicKey;

  return (
    <section className="s-card">
      <div className="s-card__head" style={{ marginBottom: 6 }}>
        <p className="s-section-lead" style={{ margin: 0 }}>Cobro con tarjeta · MercadoPago</p>
        <span className={`a-flag ${configured ? 'a-flag--on' : 'a-flag--off'}`}>
          {configured ? 'Configurado' : 'No configurado'}
        </span>
      </div>
      <p className="s-card__desc" style={{ marginBottom: 10 }}>
        Pegá tus credenciales de MercadoPago para habilitar el pago con <strong>tarjeta</strong> en tu checkout. Las
        guardamos encriptadas; nunca las mostramos de vuelta. Si no las cargás, tu checkout sigue
        funcionando solo con Yape.
      </p>
      <p className="s-card__desc" style={{ marginBottom: 12, color: 'var(--ink-2)' }}>
        💳 <strong>Con tarjeta el cobro es instantáneo</strong>: la entrada y el QR salen solos al pagar, sin que tengas que revisar el comprobante a mano como en Yape.
      </p>

      {!configured && !readOnly && (
        <details style={{ background: 'var(--cream-2)', borderRadius: 12, border: '1px solid var(--cream-3)', marginBottom: 14, padding: '10px 14px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>¿Cómo consigo mis credenciales?</summary>
          <ol style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
            <li>Entrá a tu <a href="https://www.mercadopago.com.pe/developers/panel/app" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>panel de desarrolladores de MercadoPago</a> con la cuenta donde querés recibir la plata.</li>
            <li>Creá una aplicación (o usá una existente) y abrí <strong>Credenciales de producción</strong>.</li>
            <li>Copiá el <strong>Access Token</strong> y la <strong>Public Key</strong> (empiezan con <code>APP_USR-</code>) y pegalos acá abajo.</li>
          </ol>
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--ink-3)' }}>Validamos las credenciales con MercadoPago antes de guardar, así sabés al toque si están bien.</p>
        </details>
      )}

      <form action={action} className="s-stack" style={{ gap: 14 }}>
        <input type="hidden" name="intent" value="save" />
        <Field label="Access Token (APP_USR-… o TEST-…)" htmlFor="mp_access_token" error={err.mp_access_token}>
          <input id="mp_access_token" name="mp_access_token" type="password" autoComplete="off" className="s-input" disabled={readOnly}
            placeholder={hasAccessToken ? '•••••••••• (ya cargado — pegá uno nuevo para reemplazar)' : 'APP_USR-0000000000000000-...'} />
        </Field>
        <Field label="Public Key" htmlFor="mp_public_key" error={err.mp_public_key}>
          <input id="mp_public_key" name="mp_public_key" type="password" autoComplete="off" className="s-input" disabled={readOnly}
            placeholder={hasPublicKey ? '•••••••••• (ya cargada — pegá una nueva para reemplazar)' : 'APP_USR-xxxxxxxx-...'} />
        </Field>

        {state.message && <p className={state.ok ? 's-banner s-banner--ok' : 's-banner s-banner--err'}>{state.message}</p>}

        {readOnly ? (
          <p className="s-card__desc">Solo lectura — no puedes cargar ni quitar credenciales desde aquí.</p>
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
  return (
    <button type="submit" className="s-btn s-btn--primary s-btn--lg" disabled={pending}>
      {pending ? 'Validando con MercadoPago…' : 'Validar y guardar'}
    </button>
  );
}

function RemoveButton({ formAction }: { formAction: (payload: FormData) => void }) {
  const { pending } = useFormStatus();
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
      Quitar credenciales
    </button>
  );
}
