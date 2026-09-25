import { empezar } from '@/lib/cta';
import type { Dict } from '@/lib/i18n';
import { SITE } from '@/lib/site';
import { Idioma } from '@/components/Idioma';

// 08 — Footer
export function Footer({ t }: { t: Dict }) {
  const f = t.footer;
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__col footer__brand">
            <a href="#top" className="logo">parygo<span className="dot">.</span></a>
            <p>{f.brand}</p>
            <Idioma lang={t.lang} label={t.idioma.label} className="idioma--footer" />
          </div>
          <div className="footer__col">
            <h4>{f.producto}</h4>
            <ul>
              <li><a href="#como">{f.links.como}</a></li>
              <li><a href="#seguridad">{f.links.seguridad}</a></li>
              <li><a href="#incluye">{f.links.incluye}</a></li>
              <li><a href="#precios">{f.links.precios}</a></li>
              <li><a href={empezar(t.lang)}>{f.links.crear}</a></li>
            </ul>
          </div>
          <div className="footer__col">
            <h4>{f.ayuda}</h4>
            <ul>
              <li><a href="#preguntas">{f.links.preguntas}</a></li>
              <li><a href={`mailto:${SITE.email}`}>{SITE.email}</a></li>
              <li><a href={SITE.loginUrl}>{f.links.panel}</a></li>
            </ul>
          </div>
          <div className="footer__col">
            <h4>{f.legal}</h4>
            <ul>
              <li><a href="/terminos">{f.links.terminos}</a></li>
              <li><a href="/privacidad">{f.links.privacidad}</a></li>
            </ul>
          </div>
        </div>
        <div className="footer__bottom">
          <span>{f.copy}</span>
          <span className="made">{f.made}</span>
        </div>
      </div>
    </footer>
  );
}
