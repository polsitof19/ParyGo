import { Bitcoin, CreditCard, Globe, Smartphone, Wallet, Zap } from 'lucide-react';
import type { Dict } from '@/lib/i18n';
import { Resaltado } from '@/components/Resaltado';

// Medios con los que el público le paga al organizador. Lo disponible hoy es
// lo que el sistema cobra (CLAUDE.md): tarjeta vía Mercado Pago y Yape en
// Perú. PayPal y cripto: pedido de Paul "lo haremos pronto, poco a poco"
// (2026-09-25), así que van rotulados "Próximamente", nunca como disponibles.
// Mismo orden que t.cobros.medios.
const MEDIOS = [
  { I: CreditCard, ya: true },
  { I: Wallet, ya: true },
  { I: Smartphone, ya: true },
  { I: Globe, ya: false },
  { I: Bitcoin, ya: false },
  { I: Zap, ya: false },
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
