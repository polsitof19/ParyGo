import { CTA } from '@/lib/cta';
import type { Dict } from '@/lib/i18n';
import { SITE } from '@/lib/site';

// 07 — CTA final. Tarjeta en TINTA (antes naranja con texto blanco: 2.85:1,
// fallaba AA). El naranja queda en el botón (tinta sobre acento, 5.91:1) y en
// los blobs, que no llevan texto.
export function Final({ t }: { t: Dict }) {
  const f = t.final;
  return (
    <section className="section final" id="contacto" aria-labelledby="final-title">
      <div className="container">
        <div className="final__card reveal">
          <div className="blob-a" aria-hidden="true" />
          <div className="blob-b" aria-hidden="true" />
          <div className="final__inner">
            <h2 className="h2" id="final-title">{f.h2}</h2>
            <p>
              {f.p} <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
            </p>
            <div className="final__ctas">
              <a href={CTA.hero} className="btn btn-primary btn-lg">
                {f.cta} <span className="arrow" aria-hidden="true">→</span>
              </a>
              <a href="#precios" className="btn btn-soft btn-lg">{f.precios}</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
