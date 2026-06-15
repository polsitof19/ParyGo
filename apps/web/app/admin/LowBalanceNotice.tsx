import { AlertTriangle, MessageCircle } from 'lucide-react';

// Aviso de saldo bajo de eventos (packs). Solo display: lee event_balance que el
// panel ya carga. El saldo lo carga el super admin (load_event_pack) — el dueño
// NO se auto-asigna; este aviso solo lo empuja a pedir más packs por WhatsApp.
export function LowBalanceNotice({ balance, brandName, supportWhatsapp }: { balance: number; brandName: string; supportWhatsapp: string }) {
  if (balance > 1) return null; // solo cuando queda 1 o 0

  const sinSaldo = balance <= 0;
  const digits = supportWhatsapp.replace(/[^\d]/g, '');
  const msg = encodeURIComponent(`Hola ParyGo, quiero comprar más eventos para ${brandName}${sinSaldo ? ' (me quedé sin saldo)' : ' (me queda 1)'}.`);
  const href = `https://wa.me/${digits}?text=${msg}`;

  return (
    <div
      className="s-card"
      style={{
        marginBottom: 18,
        borderColor: sinSaldo ? 'var(--alert)' : 'var(--tangerine)',
        borderWidth: 1.5,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}
      role="status"
    >
      <AlertTriangle className="h-5 w-5" style={{ flexShrink: 0, marginTop: 2, color: sinSaldo ? 'var(--alert)' : 'var(--tangerine)' }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontWeight: 700 }}>
          {sinSaldo ? 'Te quedaste sin saldo de eventos' : 'Te queda 1 evento de saldo'}
        </p>
        <p className="s-muted" style={{ fontSize: 13.5, marginTop: 2 }}>
          {sinSaldo
            ? 'Para crear un evento nuevo necesitás cargar un pack. Escribinos y te lo activamos.'
            : 'Cuando uses este último, vas a necesitar un pack nuevo para seguir creando eventos. Pedí más cuando quieras.'}
        </p>
      </div>
      <a href={href} target="_blank" rel="noopener noreferrer" className="s-btn s-btn--primary s-btn--sm" style={{ flexShrink: 0 }}>
        <MessageCircle className="h-4 w-4" /> Pedir más eventos
      </a>
    </div>
  );
}
