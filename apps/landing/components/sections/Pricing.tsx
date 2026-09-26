'use client';

import { Check } from 'lucide-react';
import { empezar } from '@/lib/cta';
import type { Dict } from '@/lib/i18n';
import { Resaltado } from '@/components/Resaltado';
import { PACKS, precio, useMoneda } from '@/lib/precios';

// 06 — Precios (4 packs; todos incluyen todo, solo cambia la cantidad). La
// moneda sale del país del visitante (lib/precios.ts): soles en Perú, dólares
// en el resto. Los montos = apps/web/lib/packs.ts.

export function Pricing({ t }: { t: Dict }) {
  const c = t.precios;
  const m = useMoneda(t.lang);
  const unit = (p: (typeof PACKS)[number]) => (m === 'PEN' ? p.pen : p.usd);
  const uno = unit(PACKS[0]);

  return (
    <section className="section pricing" id="precios" aria-labelledby="pricing-title">
      <div className="container">
        <div className="section__head center reveal">
          <h2 className="h2" id="pricing-title"><Resaltado r={c.h2} /></h2>
          <p className="lede">{c.lede}</p>
        </div>

        <div className="plans reveal-stagger">
          {PACKS.map((p) => {
            const rec = p.eventos === 3;
            const total = unit(p);
            const ahorro = uno * p.eventos - total;
            return (
              <article key={p.eventos} className={`plan${rec ? ' plan--rec' : ''}`}>
                {rec && <span className="plan__badge">{c.badge}</span>}
                <div className="plan__name">{p.eventos} {p.eventos === 1 ? c.evento : c.eventos}</div>
                <div className="plan__qty">{c.qty[p.eventos]}</div>
                <div className="plan__price">{precio(total, m)}</div>
                {/* Dos renglones fijos: con el ahorro en el mismo renglón unas
                    tarjetas partían en dos líneas y las listas quedaban desalineadas. */}
                <span className="plan__percu">
                  {precio(Math.round(total / p.eventos), m)} {c.porEvento}
                  <span className="plan__ahorro">{ahorro > 0 ? `${c.ahorras} ${precio(ahorro, m)}` : c.pagoUnico}</span>
                </span>
                <ul className="plan__list">
                  {(c.perks[p.eventos] ?? []).map((perk) => (
                    <li key={perk}><Check className="plan__tick" aria-hidden="true" />{perk}</li>
                  ))}
                </ul>
                <div className="plan__cta">
                  <a href={empezar(t.lang, { pack: p.eventos, moneda: m })} className={`btn ${rec ? 'btn-primary' : 'btn-soft'}`}>{c.elegir}</a>
                </div>
              </article>
            );
          })}
        </div>

        <p className="plans-note reveal">
          {c.note}
          {m === 'USD' && c.noteUsd}
        </p>
      </div>
    </section>
  );
}
