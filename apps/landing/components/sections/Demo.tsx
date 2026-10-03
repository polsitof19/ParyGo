import type { Dict } from '@/lib/i18n';
import { Resaltado } from '@/components/Resaltado';
import { PrecioLocal } from '@/components/PrecioLocal';

// 05 — Demo (página de evento en un teléfono)
export function Demo({ t }: { t: Dict }) {
  const d = t.demo;
  return (
    <section className="section demo" aria-labelledby="demo-title">
      <div className="blob demo__blob" aria-hidden="true" />
      <div className="container">
        <div className="demo__grid">
          <div className="reveal">
            <h2 className="h2" id="demo-title"><Resaltado r={d.h2} /></h2>
            <div className="demo__list">
              {d.items.map((it, i) => (
                <div key={it.t} className="demo__item"><span className="n">{i + 1}</span><span className="t">{it.t}<span>{it.d}</span></span></div>
              ))}
            </div>
          </div>

          <div className="phone-stage reveal">
            <div className="phone__glow" aria-hidden="true" />
            <div className="phone" id="phone" aria-hidden="true">
              <span className="phone__notch" />
              <div className="phone__screen">
                <div className="pscr__cover">
                  <span className="tagpill">{d.tag}</span>
                  <span className="evt-name">{d.evt1}<br />{d.evt2}</span>
                  <span className="evt-meta">{d.meta}</span>
                </div>
                <div className="pscr__body">
                  <div className="pscr__tk sel">
                    <span className="nm">{d.tk1[0]}<span>{d.tk1[1]}</span></span>
                    <span className="pr"><PrecioLocal pen={40} usd={12} lang={t.lang} /></span>
                  </div>
                  <div className="pscr__tk">
                    <span className="nm">{d.tk2[0]}<span>{d.tk2[1]}</span></span>
                    <span className="pr"><PrecioLocal pen={80} usd={25} lang={t.lang} /></span>
                  </div>
                  <div className="pscr__buy">{d.buy}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
