import { Plus } from 'lucide-react';
import { FAQ } from '@/lib/faq';
import { SITE } from '@/lib/site';

// Preguntas frecuentes con <details>: acordeón nativo, accesible y sin JS.
export function Preguntas() {
  return (
    <section className="section faq" id="preguntas" aria-labelledby="faq-title">
      <div className="container faq__grid">
        <div className="reveal">
          <h2 className="h2" id="faq-title">Preguntas <span className="accent">frecuentes</span>.</h2>
          <p className="lede faq__lede">
            ¿Te quedó otra duda? Escríbenos a <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
          </p>
        </div>
        <div className="faq__lista reveal">
          {FAQ.map((f) => (
            <details key={f.q} className="faq__item">
              <summary className="faq__q">
                <span>{f.q}</span>
                <Plus className="faq__ico" aria-hidden="true" />
              </summary>
              <p className="faq__a">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
