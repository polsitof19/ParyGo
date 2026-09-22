import { MessageCircle } from 'lucide-react';

// Aviso de saldo bajo de eventos (packs). Solo display: lee event_balance que el
// panel ya carga. El saldo lo carga el super admin (load_event_pack) — el dueño
// NO se auto-asigna; este aviso solo lo empuja a pedir más packs por WhatsApp.
//
// Es una LÍNEA con punto, no una tarjeta: antes llevaba var(--shadow-sm) y era
// el último rectángulo flotante que quedaba en el panel. El punto lo pone el
// modificador (--alert sin saldo, acento cuando queda 1) y el botón es de
// texto: el único primario de la home es "Crear evento".
export function LowBalanceNotice({ balance, brandName, supportWhatsapp }: { balance: number; brandName: string; supportWhatsapp: string }) {
  if (balance > 1) return null; // solo cuando queda 1 o 0

  const sinSaldo = balance <= 0;
  const digits = supportWhatsapp.replace(/[^\d]/g, '');
  const msg = encodeURIComponent(`Hola ParyGo, quiero comprar más eventos para ${brandName}${sinSaldo ? ' (me quedé sin saldo)' : ' (me queda 1)'}.`);
  const href = `https://wa.me/${digits}?text=${msg}`;

  return (
    <div className={`a-task${sinSaldo ? ' a-task--alert' : ''}`} role="status">
      <span className="a-task__txt">
        <span style={{ minWidth: 0 }}>
          <strong>
            {sinSaldo ? 'Te quedaste sin saldo de eventos' : 'Te queda 1 evento de saldo'}
          </strong>
          <span className="a-task__sub">
            {sinSaldo
              ? 'Para crear un evento nuevo necesitas cargar un pack. Escríbenos y te lo activamos.'
              : 'Cuando uses este último, vas a necesitar un pack nuevo para seguir creando eventos. Pide más cuando quieras.'}
          </span>
        </span>
      </span>
      <a href={href} target="_blank" rel="noopener noreferrer" className="s-btn s-btn--soft s-btn--sm">
        <MessageCircle className="h-4 w-4" /> Pedir más eventos
      </a>
    </div>
  );
}
