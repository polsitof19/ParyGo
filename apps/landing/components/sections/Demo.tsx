// 05 — Demo (página de evento en un teléfono)
export function Demo() {
  return (
    <section className="section demo" aria-labelledby="demo-title">
      <div className="blob demo__blob" aria-hidden="true" />
      <div className="container">
        <div className="demo__grid">
          <div className="reveal">
            <span className="eyebrow eyebrow--peri">Así se ve</span>
            <h2 className="h2" id="demo-title">
              Una página linda que <span className="accent">vende sola</span>.
            </h2>
            <div className="demo__list">
              <div className="demo__item"><span className="n">1</span><span className="t">Tu marca al frente<span>Tus colores, tu cover, tu nombre.</span></span></div>
              <div className="demo__item"><span className="n">2</span><span className="t">Entradas que tú defines<span>General, VIP, preventa, cortesías.</span></span></div>
              <div className="demo__item"><span className="n">3</span><span className="t">Pago en un toque<span>Yape o tarjeta, directo a tu cuenta.</span></span></div>
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
                  <span className="evt-meta">SÁB 24 ENE · CLUB DELMAR · LIMA</span>
                </div>
                <div className="pscr__body">
                  <div className="pscr__tk sel">
                    <span className="nm">General<span>Entrada al evento</span></span>
                    <span className="pr">S/40</span>
                  </div>
                  <div className="pscr__tk">
                    <span className="nm">VIP<span>Zona preferente + barra</span></span>
                    <span className="pr">S/80</span>
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
