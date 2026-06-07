// 04 — Todo lo que incluye cada evento (grid alegre con íconos — refinamiento 5)
type Inc = { title: React.ReactNode; icon: React.ReactNode; feature?: boolean };

const ITEMS: Inc[] = [
  {
    feature: true,
    title: (
      <>
        Cobro directo: Yape y tarjeta. <span className="accent">Cero comisión por entrada.</span>
      </>
    ),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" /></svg>
    ),
  },
  {
    title: 'Tu página con tu marca, logo y colores',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  },
  {
    title: 'Entradas con QR por email automático',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9l9 6 9-6" /></svg>,
  },
  {
    title: 'Validador de puerta con control de reingreso',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3" /><path d="M21 14v3" /><path d="M14 21h7" /></svg>,
  },
  {
    title: 'Panel de ventas en tiempo real',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 7-7" /><path d="M14 8h7v7" /></svg>,
  },
  {
    title: 'Códigos promo para tus RR.PP.',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
  },
  {
    title: 'Preventa con subida de precio automática',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
  },
  {
    title: 'Entradas ilimitadas',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="M12 8v8" /></svg>,
  },
  {
    title: 'Entradas gratis con QR para cortesías',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
  },
  {
    title: 'Soporte incluido siempre',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /></svg>,
  },
];

export function Includes() {
  return (
    <section className="section includes" id="incluye" aria-labelledby="inc-title">
      <div className="blob includes__blob" aria-hidden="true" />
      <div className="container">
        <div className="section__head center reveal">
          <span className="eyebrow">Todo incluido</span>
          <h2 className="h2" id="inc-title">
            Todo lo que incluye <span className="accent">cada evento</span>.
          </h2>
        </div>

        <div className="inc-grid reveal-stagger">
          {ITEMS.map((it, i) => (
            <article key={i} className={`inc${it.feature ? ' inc--feature' : ''}`}>
              <div className="inc__icon" aria-hidden="true">{it.icon}</div>
              <div className="inc__title">{it.title}</div>
            </article>
          ))}
        </div>

        <p className="includes__note reveal">
          Cobres o no cobres entrada, <span className="accent">siempre controlas quién entra</span>.
        </p>
      </div>
    </section>
  );
}
