// 03 — Cómo funciona (3 pasos)
export function How() {
  return (
    <section className="section how" id="como" aria-labelledby="how-title">
      <div className="blob how__blob" aria-hidden="true" />
      <div className="container">
        <div className="section__head reveal">
          <h2 className="h2" id="how-title">
            Tu evento online en <span className="accent">3 pasos</span>.
          </h2>
        </div>

        <div className="steps reveal-stagger">
          <article className="step">
            <div className="step__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
            </div>
            <div className="step__num">Paso 01</div>
            <h3 className="h3 step__title">Creas tu evento</h3>
            <p className="step__body">Pones fecha, lugar y flyer, y armas tus entradas: generales, VIP, preventas o gratis. Tu página queda lista en tumarca.parygo.com.</p>
          </article>

          <article className="step">
            <div className="step__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
            </div>
            <div className="step__num">Paso 02</div>
            <h3 className="h3 step__title">Compartes el link</h3>
            <p className="step__body">Lo pegas en Instagram, WhatsApp o donde vendas. Tu público compra en un minuto y recibe su entrada con QR en su correo.</p>
          </article>

          <article className="step">
            <div className="step__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
            </div>
            <div className="step__num">Paso 03</div>
            <h3 className="h3 step__title">Validas en la puerta</h3>
            <p className="step__body">Tu equipo escanea cada QR con el celular, sin instalar nada. Cada entrada pasa una sola vez y ves quién ya llegó en vivo.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
