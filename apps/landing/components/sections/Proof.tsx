// 07 — Prueba social.
// REFINAMIENTO 1 (placeholder honesto): estructura lista para el primer cliente
// real (Tío Code · Almighty), avatar con inicial, PERO sin cita inventada.
// Regla del proyecto: no inventar testimonios ni métricas. Paul reemplaza el
// texto entre corchetes por la cita real cuando la tenga.
export function Proof() {
  return (
    <section className="section proof" aria-labelledby="proof-title">
      <div className="container">
        <div className="proof__card reveal">
          <div className="proof__quote-mark" aria-hidden="true">&ldquo;</div>

          {/* TODO(Paul): reemplazar por el testimonio REAL de Tío Code cuando esté. */}
          <p className="proof__quote is-placeholder" id="proof-title">
            [Testimonio real pendiente — lo completa el organizador de Almighty]
          </p>
          <span className="proof__placeholder-tag">Testimonio real pendiente</span>

          <div className="proof__author">
            <div className="proof__avatar" aria-hidden="true">TC</div>
            <div className="proof__who">
              <div className="nm">Tío Code</div>
              <div className="role">Organizador de Almighty</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
