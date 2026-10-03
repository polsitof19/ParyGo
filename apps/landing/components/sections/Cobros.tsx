import { Bitcoin, CreditCard, Globe, Smartphone, Wallet, Zap } from 'lucide-react';
import type { Dict } from '@/lib/i18n';
import { Resaltado } from '@/components/Resaltado';

// Medios con los que el público le paga al organizador. Todos "Disponible"
// por decisión de Paul (2026-10-01: "pon todo disponible porque ya ahora lo
// implementaremos"): Mercado Pago con conectar cuenta, PayPal, cripto y los
// medios locales por país están en construcción. Mismo orden que
// t.cobros.medios. El campo `ya` queda para volver a marcar "Próximamente".
const MEDIOS = [
  { I: CreditCard, ya: true },
  { I: Wallet, ya: true },
  { I: Smartphone, ya: true },
  { I: Globe, ya: true },
  { I: Bitcoin, ya: true },
  { I: Zap, ya: true },
];

export function Cobros({ t }: { t: Dict }) {
  const c = t.cobros;
  return (
    <section className="section cobros" id="cobros" aria-labelledby="cobros-title">
      <div className="container">
        <div className="section__head reveal">
          <h2 className="h2" id="cobros-title"><Resaltado r={c.h2} /></h2>
          <p className="lede">{c.lede}</p>
        </div>
        <ul className="medios reveal-stagger">
          {c.medios.map((m, i) => {
            const { I, ya } = MEDIOS[i] ?? { I: Zap, ya: false };
            return (
              <li key={m.t} className={`medio${ya ? '' : ' medio--pronto'}`}>
                <I className="medio__ico" aria-hidden="true" />
                <span className="medio__txt">
                  <span className="medio__t">{m.t}</span>
                  <span className="medio__d">{m.d}</span>
                </span>
                <span className="medio__estado">
                  <span className={`punto ${ya ? 'punto--ok' : 'punto--pronto'}`} aria-hidden="true" />
                  {ya ? c.disponible : c.pronto}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
