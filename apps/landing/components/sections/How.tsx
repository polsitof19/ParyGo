import type { Dict } from '@/lib/i18n';
import { Resaltado } from '@/components/Resaltado';

// 03 — Cómo funciona (3 pasos). Íconos en el mismo orden que t.how.steps.
const ICONOS = [
  <svg key="a" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>,
  <svg key="b" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>,
  <svg key="c" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
];

export function How({ t }: { t: Dict }) {
  return (
    <section className="section how" id="como" aria-labelledby="how-title">
      <div className="blob how__blob" aria-hidden="true" />
      <div className="container">
        <div className="section__head reveal">
          <h2 className="h2" id="how-title"><Resaltado r={t.how.h2} /></h2>
        </div>

        <div className="steps reveal-stagger">
          {t.how.steps.map((s, i) => (
            <article key={s.t} className="step">
              <div className="step__icon" aria-hidden="true">{ICONOS[i]}</div>
              <div className="step__num">{t.how.paso} {String(i + 1).padStart(2, '0')}</div>
              <h3 className="h3 step__title">{s.t}</h3>
              <p className="step__body">{s.d}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
