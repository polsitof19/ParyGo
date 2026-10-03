'use client';

import { useFormStatus } from 'react-dom';
import { useFormFeedback } from '@/components/useFormFeedback';
import { useTextos } from '@/components/IdiomaPanel';
import { conectarMpAction, desconectarMpAction, type SettingsState } from './actions';

const initial: SettingsState = { ok: false, message: null };

// "Conectar Mercado Pago" (OAuth, 0086). Ningún token pasa por acá: el botón
// lleva a la cuenta de MP de la organizadora y la vuelta la deja conectada.
// `puede` = dueña real de la marca (no staff, no super admin mirando).
export function MpConexion({ conectada, cuenta, disponible, puede }: { conectada: boolean; cuenta: string | null; disponible: boolean; puede: boolean }) {
  const { t } = useTextos();
  const [, desconectar] = useFormFeedback(async (_p: SettingsState) => desconectarMpAction(), initial);

  if (conectada) {
    return (
      <section className="s-stack" style={{ gap: 12 }}>
        <p className="s-card__desc">
          {t('Conectado. Tus compradores pueden pagar con tarjeta y la plata llega directo a tu cuenta de Mercado Pago', 'Connected. Your buyers can pay by card and the money goes straight to your Mercado Pago account')}
          {cuenta ? ` (${t('cuenta', 'account')} ${cuenta}).` : '.'}
        </p>
        {puede && (
          <form action={desconectar}>
            <Boton clase="s-btn s-btn--ghost" texto={t('Desconectar Mercado Pago', 'Disconnect Mercado Pago')} pendiente={t('Desconectando…', 'Disconnecting…')} />
          </form>
        )}
      </section>
    );
  }

  return (
    <section className="s-stack" style={{ gap: 12 }}>
      <p className="s-card__desc">
        {t('Conecta tu cuenta de Mercado Pago y tus compradores podrán pagar con tarjeta. La plata llega directo a tu cuenta; ParyGo no la toca.', 'Connect your Mercado Pago account and your buyers can pay by card. The money goes straight to your account; ParyGo never touches it.')}
      </p>
      {!disponible ? (
        <p className="s-card__desc">{t('Muy pronto vas a poder conectarla desde aquí.', 'You will be able to connect it from here very soon.')}</p>
      ) : puede ? (
        <form action={conectarMpAction}>
          <Boton clase="s-btn s-btn--soft s-btn--lg" texto={t('Conectar Mercado Pago', 'Connect Mercado Pago')} pendiente={t('Abriendo Mercado Pago…', 'Opening Mercado Pago…')} />
        </form>
      ) : (
        <p className="s-card__desc">{t('Solo la cuenta dueña de la marca puede conectar Mercado Pago.', 'Only the brand owner can connect Mercado Pago.')}</p>
      )}
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
