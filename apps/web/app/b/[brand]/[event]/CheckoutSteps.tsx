// Stepper de la compra, sensible al método de pago. Solo markup estático
// (clases c-steps / c-step / c-step--on / c-step__line) — sin estado ni lógica,
// por eso es server-safe y se reusa tanto en el panel cliente como en /yape.
//
// - Yape (yape_manual) → 4 pasos: Entradas · Tus datos · Pagar con Yape · ¡Listo!
// - MP / gratis        → 3 pasos: Entradas · Datos + pago · ¡Listo!
//
// `active` es el número de paso activo (1-based). Pasos <= active quedan "on".

export function CheckoutSteps({
  method,
  active,
}: {
  method: 'yape_manual' | 'mercadopago';
  active: number;
}) {
  const steps =
    method === 'yape_manual'
      ? ['Entradas', 'Tus datos', 'Pagar con Yape', '¡Listo!']
      : ['Entradas', 'Datos + pago', '¡Listo!'];

  return (
    <ol className="c-steps" aria-label="Pasos de la compra">
      {steps.map((label, i) => {
        const n = i + 1;
        const on = n <= active;
        return (
          <span key={n} style={{ display: 'contents' }}>
            {i > 0 && <span className="c-step__line" aria-hidden="true" />}
            <li
              role="listitem"
              aria-current={n === active ? 'step' : undefined}
              className={`c-step ${on ? 'c-step--on' : ''}`}
            >
              <b>{n}</b> {label}
            </li>
          </span>
        );
      })}
    </ol>
  );
}
