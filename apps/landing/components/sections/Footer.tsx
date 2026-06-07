import { CTA } from '@/lib/cta';

// 08 — Footer
export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__col footer__brand">
            <a href="#top" className="logo">parygo<span className="dot">.</span></a>
            <p>La forma más simple de vender y controlar las entradas de tu evento en Perú.</p>
          </div>
          <div className="footer__col">
            <h4>Producto</h4>
            <ul>
              <li><a href="#como">Cómo funciona</a></li>
              <li><a href="#incluye">Qué incluye</a></li>
              <li><a href="#precios">Precios</a></li>
            </ul>
          </div>
          <div className="footer__col">
            <h4>Ayuda</h4>
            <ul>
              <li><a href={CTA.final} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
              <li><a href="mailto:hola@parygo.com">hola@parygo.com</a></li>
              <li><a href="#precios">Preguntas frecuentes</a></li>
            </ul>
          </div>
          <div className="footer__col">
            <h4>Legal</h4>
            <ul>
              <li><a href="#">Términos</a></li>
              <li><a href="#">Privacidad</a></li>
            </ul>
          </div>
        </div>
        <div className="footer__bottom">
          <span>© 2026 ParyGo — Hecho en Lima, Perú 🧡</span>
          <span className="made">Vende lindo, cobra directo.</span>
        </div>
      </div>
    </footer>
  );
}
