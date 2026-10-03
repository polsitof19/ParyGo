'use client';

import { useFormStatus } from 'react-dom';
import { useFormFeedback } from '@/components/useFormFeedback';
import { useTextos } from '@/components/IdiomaPanel';
import { conectarPaypalAction, desconectarPaypalAction, type SettingsState } from './actions';

const initial: SettingsState = { ok: false, message: null };

// "Conectar PayPal" (0091): la dueña pega el Client ID + Secret de SU app.
// Al navegador solo llegan los últimos 4 del Client ID; el secret sale del
// formulario hacia la action y nunca vuelve.
// `puede` = dueña real de la marca. `sirve` = moneda USD/EUR/MXN.
export function PaypalConexion({ conectada, ultimos4, sirve, puede, esPrueba }: { conectada: boolean; ultimos4: string | null; sirve: boolean; puede: boolean; esPrueba: boolean }) {
  const { t } = useTextos();
  const [, desconectar] = useFormFeedback(async (_p: SettingsState) => desconectarPaypalAction(), initial);
  const [state, conectar] = useFormFeedback(conectarPaypalAction, initial);

  const formulario = (
    <form action={conectar} className="s-stack" style={{ gap: 12 }}>
      <div className="s-field">
        <label htmlFor="paypal_client_id" className="s-label">Client ID</label>
        <input id="paypal_client_id" name="paypal_client_id" type="text" autoComplete="off" spellCheck={false} required className="s-input" />
      </div>
      <div className="s-field">
        <label htmlFor="paypal_secret" className="s-label">Secret</label>
        <input id="paypal_secret" name="paypal_secret" type="password" autoComplete="off" spellCheck={false} required className="s-input" />
      </div>
      {esPrueba && (
        <label className="s-card__desc">
          <input type="checkbox" name="paypal_sandbox" value="1" /> {t('Sandbox (solo pruebas)', 'Sandbox (testing only)')}
        </label>
      )}
      {state.message && <p className={state.ok ? 's-banner s-banner--ok' : 's-banner s-banner--err'} role="status">{state.message}</p>}
      <Boton clase="s-btn s-btn--primary s-btn--lg" texto={t('Conectar PayPal', 'Connect PayPal')} pendiente={t('Conectando…', 'Connecting…')} />
    </form>
  );

  if (conectada) {
    return (
      <section className="s-stack" style={{ gap: 12 }}>
        <p className="s-card__desc">
          {t('Conectado', 'Connected')}{ultimos4 ? ` (app …${ultimos4})` : ''}. {t('Tus compradores pagan con PayPal o con tarjeta y la plata llega directo a tu cuenta de PayPal.', 'Your buyers pay with PayPal or by card and the money goes straight to your PayPal account.')}
        </p>
        {puede && (
          <>
            <form action={desconectar}>
              <Boton clase="s-btn s-btn--ghost" texto={t('Desconectar PayPal', 'Disconnect PayPal')} pendiente={t('Desconectando…', 'Disconnecting…')} />
            </form>
            <details className="s-fold">
              <summary><span className="s-fold__t">{t('Cambiar de app', 'Switch app')}</span></summary>
              <div className="s-fold__body">{formulario}</div>
            </details>
          </>
        )}
      </section>
    );
  }

  if (!sirve) {
    return <p className="s-hint">{t('PayPal: solo para marcas que venden en dólares, euros o pesos mexicanos.', 'PayPal: only for brands selling in US dollars, euros or Mexican pesos.')}</p>;
  }

  if (!puede) {
    return <p className="s-card__desc">{t('Solo la cuenta dueña de la marca puede conectar PayPal.', 'Only the brand owner can connect PayPal.')}</p>;
  }

  return (
    <section className="s-stack" style={{ gap: 12 }}>
      <ol className="s-card__desc" style={{ paddingLeft: 20, listStyle: 'decimal' }}>
        <li>{t('Entra a developer.paypal.com con tu cuenta PayPal Business.', 'Go to developer.paypal.com with your PayPal Business account.')}</li>
        <li>{t('Apps & Credentials → modo Live → Create App.', 'Apps & Credentials → Live mode → Create App.')}</li>
        <li>{t('Copia el Client ID y el Secret y pégalos aquí.', 'Copy the Client ID and Secret and paste them here.')}</li>
      </ol>
      {formulario}
    </section>
  );
}

function Boton({ clase, texto, pendiente }: { clase: string; texto: string; pendiente: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={clase} disabled={pending}>
      {pending ? pendiente : texto}
    </button>
  );
}
