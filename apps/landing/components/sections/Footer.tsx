import { CTA } from '@/lib/cta';
import { SITE } from '@/lib/site';

// 08 — Footer
export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__col footer__brand">
            <a href="#top" className="logo">parygo<span className="dot">.</span></a>
            <p>La forma simple de vender y controlar las entradas de tus eventos, con tu marca y cobrando directo.</p>
          </div>
          <div className="footer__col">
            <h4>Producto</h4>
            <ul>
              <li><a href="#como">Cómo funciona</a></li>
              <li><a href="#seguridad">Seguridad</a></li>
              <li><a href="#incluye">Qué incluye</a></li>
              <li><a href="#precios">Precios</a></li>
              <li><a href={CTA.hero}>Crear mi marca</a></li>
            </ul>
          </div>
          <div className="footer__col">
            <h4>Ayuda</h4>
            <ul>
              <li><a href="#preguntas">Preguntas frecuentes</a></li>
              <li><a href={`mailto:${SITE.email}`}>{SITE.email}</a></li>
              <li><a href={SITE.loginUrl}>Ingresar al panel</a></li>
            </ul>
          </div>
          <div className="footer__col">
            <h4>Legal</h4>
            <ul>
              <li><a href="/terminos">Términos</a></li>
              <li><a href="/privacidad">Privacidad</a></li>
            </ul>
          </div>
        </div>
        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} ParyGo</span>
          <span className="made">Vende con tu marca, cobra directo.</span>
        </div>
      </div>
    </footer>
  );
}
