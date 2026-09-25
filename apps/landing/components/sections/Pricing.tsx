'use client';

import { Check } from 'lucide-react';
import { CTA } from '@/lib/cta';
import { PACKS, precio, useMoneda } from '@/lib/precios';

// 06 — Precios (4 packs; todos incluyen todo, solo cambia la cantidad). La
// moneda sale del país del visitante (lib/precios.ts): soles en Perú, dólares
// en el resto. Los montos = apps/web/lib/packs.ts.
const EXTRAS: Record<number, { qty: string; perks: string[]; href: string; rec?: boolean }> = {
  1: { qty: 'Para un evento puntual', perks: ['Todas las funciones', 'Entradas ilimitadas', 'Soporte por correo'], href: CTA.pack1 },
  3: { qty: 'El más elegido', perks: ['Todas las funciones', 'Entradas ilimitadas', 'Soporte prioritario'], href: CTA.pack3, rec: true },
  5: { qty: 'Para una temporada', perks: ['Todas las funciones', 'Entradas ilimitadas', 'Acompañamiento 1:1'], href: CTA.pack5 },
  10: { qty: 'Para productoras', perks: ['Todas las funciones', 'Entradas ilimitadas', 'Onboarding por videollamada'], href: CTA.pack10 },
};

export function Pricing() {
  const m = useMoneda();
  const unit = (p: (typeof PACKS)[number]) => (m === 'PEN' ? p.pen : p.usd);
  const uno = unit(PACKS[0]);

  return (
    <section className="section pricing" id="precios" aria-labelledby="pricing-title">
      <div className="container">
        <div className="section__head center reveal">
          <h2 className="h2" id="pricing-title">Pagas una vez <span className="accent">por evento</span>.</h2>
          <p className="lede">Sin mensualidades y sin comisión por entrada. Todos los packs incluyen todas las funciones: solo eliges cuántos eventos necesitas.</p>
        </div>

        <a href={CTA.hero} className="prueba reveal">
          <span className="prueba__t">Empieza con la prueba gratis</span>
          <span className="prueba__d">1 evento de hasta 20 entradas, sin tarjeta. Solo confirmas tu correo.</span>
          <span className="prueba__cta">Probar gratis →</span>
        </a>

        <div className="plans reveal-stagger">
          {PACKS.map((p) => {
            const x = EXTRAS[p.eventos]!;
            const total = unit(p);
            const ahorro = uno * p.eventos - total;
            return (
              <article key={p.eventos} className={`plan${x.rec ? ' plan--rec' : ''}`}>
                {x.rec && <span className="plan__badge">Más popular</span>}
                <div className="plan__name">{p.eventos} evento{p.eventos === 1 ? '' : 's'}</div>
                <div className="plan__qty">{x.qty}</div>
                <div className="plan__price">{precio(total, m)}</div>
                {/* Dos renglones fijos: con "ahorras" en el mismo renglón unas
                    tarjetas partían en dos líneas y las listas quedaban desalineadas. */}
                <span className="plan__percu">
                  {precio(Math.round(total / p.eventos), m)} por evento
                  <span className="plan__ahorro">{ahorro > 0 ? `Ahorras ${precio(ahorro, m)}` : 'Pago único'}</span>
                </span>
                <ul className="plan__list">
                  {x.perks.map((perk) => (
                    <li key={perk}><Check className="plan__tick" aria-hidden="true" />{perk}</li>
                  ))}
                </ul>
                <div className="plan__cta">
                  <a href={x.href} className={`btn ${x.rec ? 'btn-primary' : 'btn-soft'}`}>Elegir</a>
                </div>
              </article>
            );
          })}
        </div>

        <p className="plans-note reveal">
          Un evento = un evento completo, con entradas ilimitadas y todas las funciones.
          {m === 'USD' && ' Por ahora el pago con tarjeta se procesa en soles peruanos y tu banco hace la conversión; pronto también en dólares con PayPal.'}
        </p>
      </div>
    </section>
  );
}
