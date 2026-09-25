import { Bitcoin, CreditCard, Globe, Smartphone, Wallet, Zap } from 'lucide-react';

// Medios con los que el público le paga al organizador. Lo disponible hoy es
// lo que el sistema cobra (CLAUDE.md): tarjeta vía Mercado Pago y Yape en
// Perú. PayPal y cripto: pedido de Paul "lo haremos pronto, poco a poco"
// (2026-09-25), así que van rotulados "Pronto", nunca como disponibles.
const MEDIOS = [
  { I: CreditCard, t: 'Tarjetas de crédito y débito', d: 'Visa, Mastercard y más, vía Mercado Pago', ya: true },
  { I: Wallet, t: 'Mercado Pago', d: 'Saldo y cuenta, en los países donde opera', ya: true },
  { I: Smartphone, t: 'Yape', d: 'Transferencia al instante, en Perú', ya: true },
  { I: Globe, t: 'PayPal', d: 'Para cobrar a público de cualquier país', ya: false },
  { I: Bitcoin, t: 'Bitcoin y cripto', d: 'Pagos con criptomonedas', ya: false },
  { I: Zap, t: 'Más medios locales', d: 'Los que se usan en cada país', ya: false },
];

export function Cobros() {
  return (
    <section className="section cobros" id="cobros" aria-labelledby="cobros-title">
      <div className="container">
        <div className="section__head reveal">
          <h2 className="h2" id="cobros-title">
            Tu público paga <span className="accent">como prefiera</span>.
          </h2>
          <p className="lede">
            Conectas tus propias cuentas de cobro y ParyGo las usa en tu página. Vamos sumando medios poco a poco.
          </p>
        </div>
        <ul className="medios reveal-stagger">
          {MEDIOS.map(({ I, t, d, ya }) => (
            <li key={t} className={`medio${ya ? '' : ' medio--pronto'}`}>
              <I className="medio__ico" aria-hidden="true" />
              <span className="medio__txt">
                <span className="medio__t">{t}</span>
                <span className="medio__d">{d}</span>
              </span>
              <span className="medio__estado">
                <span className={`punto ${ya ? 'punto--ok' : 'punto--pronto'}`} aria-hidden="true" />
                {ya ? 'Disponible' : 'Pronto'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
