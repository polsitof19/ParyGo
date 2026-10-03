import Link from 'next/link';
import { textosPanel } from '@/lib/idiomaServer';

// Aviso de saldo bajo de eventos (packs). Solo display: lee event_balance que el
// panel ya carga. Desde la 0070 el dueño compra solo (MercadoPago o PayPal) y
// el saldo se suma al confirmarse el pago; antes lo empujaba a WhatsApp.
//
// Es una LÍNEA con punto, no una tarjeta: antes llevaba var(--shadow-sm) y era
// el último rectángulo flotante que quedaba en el panel. El punto lo pone el
// modificador (--alert sin saldo, acento cuando queda 1) y el botón es
// secundario: el único primario de la home es "Crear evento".
export async function LowBalanceNotice({ balance }: { balance: number }) {
  if (balance > 1) return null; // solo cuando queda 1 o 0

  const { t } = await textosPanel();
  const sinSaldo = balance <= 0;
  return (
    <div className={`a-task${sinSaldo ? ' a-task--alert' : ''}`} role="status">
      <span className="a-task__txt">
        <span style={{ minWidth: 0 }}>
          <strong>
            {sinSaldo ? t('Te quedaste sin saldo de eventos', 'You ran out of event balance') : t('Te queda 1 evento de saldo', 'You have 1 event left in your balance')}
          </strong>
          <span className="a-task__sub">
            {sinSaldo
              ? t('Para crear un evento nuevo compra un paquete. Pagas y se suma al toque.', 'To create a new event, buy a pack. Pay and it is added instantly.')
              : t('Cuando uses este último, vas a necesitar un paquete nuevo. Cómpralo cuando quieras.', 'When you use this last one, you will need a new pack. Buy it whenever you want.')}
          </span>
        </span>
      </span>
      <Link href="/admin/comprar" className="s-btn s-btn--soft s-btn--sm">{t('Comprar eventos', 'Buy events')}</Link>
    </div>
  );
}
