import { PrecioLocal } from '@/components/PrecioLocal';

// 05 — Demo (página de evento en un teléfono)
export function Demo() {
  return (
    <section className="section demo" aria-labelledby="demo-title">
      <div className="blob demo__blob" aria-hidden="true" />
      <div className="container">
        <div className="demo__grid">
          <div className="reveal">
            <h2 className="h2" id="demo-title">
              Una página linda que <span className="accent">vende sola</span>.
            </h2>
            <div className="demo__list">
              <div className="demo__item"><span className="n">1</span><span className="t">Tu marca al frente<span>Tu logo, tus colores y el flyer de tu evento, en tumarca.parygo.com.</span></span></div>
              <div className="demo__item"><span className="n">2</span><span className="t">Entradas que tú defines<span>General, VIP, preventas con subida de precio, gratis o privadas por link.</span></span></div>
              <div className="demo__item"><span className="n">3</span><span className="t">Compra en un minuto<span>Sin crear cuenta. Paga y recibe su QR al instante.</span></span></div>
            </div>
          </div>

          <div className="phone-stage reveal">
            <div className="phone__glow" aria-hidden="true" />
            <div className="phone" id="phone" aria-hidden="true">
              <span className="phone__notch" />
              <div className="phone__screen">
                <div className="pscr__cover">
                  <span className="tagpill">● Vendiendo</span>
                  <span className="evt-name">Verano<br />Sunset 04</span>
                  <span className="evt-meta">SÁB 24 ENE · 10:00 PM · CLUB DELMAR</span>
                </div>
                <div className="pscr__body">
                  <div className="pscr__tk sel">
                    <span className="nm">General<span>Entrada al evento</span></span>
                    <span className="pr"><PrecioLocal pen={40} usd={12} /></span>
                  </div>
                  <div className="pscr__tk">
                    <span className="nm">VIP<span>Zona preferente + barra</span></span>
                    <span className="pr"><PrecioLocal pen={80} usd={25} /></span>
                  </div>
                  <div className="pscr__buy">Comprar entrada →</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
