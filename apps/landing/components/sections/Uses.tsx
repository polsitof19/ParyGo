// 02 — Para quién (chips alegres)
export function Uses() {
  return (
    <section className="section uses" aria-labelledby="uses-title">
      <div className="container">
        <div className="uses__head reveal">
          <span className="eyebrow eyebrow--peri">Para todo tipo de evento</span>
          <h2 className="h2" id="uses-title">
            Si organizas algo, <span className="accent">es para ti</span>.
          </h2>
        </div>

        <div className="uses__chips reveal-stagger">
          <span className="use-chip"><span className="emoji" aria-hidden="true">🎧</span> Discotecas</span>
          <span className="use-chip"><span className="emoji" aria-hidden="true">🎤</span> Conciertos</span>
          <span className="use-chip"><span className="emoji" aria-hidden="true">🎉</span> Fiestas</span>
          <span className="use-chip"><span className="emoji" aria-hidden="true">🎂</span> Cumpleaños</span>
          <span className="use-chip"><span className="emoji" aria-hidden="true">💼</span> Eventos corporativos</span>
        </div>

        <p className="uses__note reveal">
          Cobres o no cobres entrada, <span className="accent">siempre controlas quién entra</span>.
        </p>
      </div>
    </section>
  );
}
