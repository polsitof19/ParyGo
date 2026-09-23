import { CTA } from '@/lib/cta';

// 07 — CTA final
export function Final() {
  return (
    <section className="section final" id="contacto" aria-labelledby="final-title">
      <div className="container">
        <div className="final__card reveal">
          <div className="blob-a" aria-hidden="true" />
          <div className="blob-b" aria-hidden="true" />
          <div className="final__inner">
            <h2 className="h2" id="final-title">¿Armamos tu próximo evento?</h2>
            <p>
              Escríbenos a{' '}
              <a href="mailto:parygoasistencia@gmail.com" style={{ textDecoration: 'underline' }}>
                parygoasistencia@gmail.com
              </a>{' '}
              y te dejamos vendiendo en 24 horas. Sin compromiso.
            </p>
            <div className="final__ctas">
              <a href={CTA.final} className="btn btn-primary btn-lg">
                Escríbenos <span className="arrow" aria-hidden="true">→</span>
              </a>
              <a href="#precios" className="btn btn-soft btn-lg">Ver precios</a>
            </div>
            <div className="final__status"><span className="dot" aria-hidden="true" />Respondemos en menos de 1 hora</div>
          </div>
        </div>
      </div>
    </section>
  );
}
