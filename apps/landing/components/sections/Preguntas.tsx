import { Plus } from 'lucide-react';
import type { Dict } from '@/lib/i18n';
import { SITE } from '@/lib/site';
import { Resaltado } from '@/components/Resaltado';

// Preguntas frecuentes con <details>: acordeón nativo, accesible y sin JS.
export function Preguntas({ t }: { t: Dict }) {
  const f = t.faq;
  return (
    <section className="section faq" id="preguntas" aria-labelledby="faq-title">
      <div className="container faq__grid">
        <div className="reveal">
          <h2 className="h2" id="faq-title"><Resaltado r={f.h2} /></h2>
          <p className="lede faq__lede">
            {f.lede} <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
          </p>
        </div>
        <div className="faq__lista reveal">
          {f.items.map((it) => (
            <details key={it.q} className="faq__item">
              <summary className="faq__q">
                <span>{it.q}</span>
                <Plus className="faq__ico" aria-hidden="true" />
              </summary>
              <p className="faq__a">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
