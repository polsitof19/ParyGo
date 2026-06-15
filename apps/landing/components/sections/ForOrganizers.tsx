import { CTA } from '@/lib/cta';

// 06b — ParyGo para organizadores (qué es / cómo funciona / pedir acceso).
// Prueba social HONESTA: sin inventar volumen. El modelo es el argumento.
type Point = { title: string; desc: string; icon: React.ReactNode };

const POINTS: Point[] = [
  {
    title: 'La plata es tuya, directa',
    desc: 'Cobrás con TU Yape o TU MercadoPago. ParyGo nunca toca el dinero de tus entradas.',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" /></svg>,
  },
  {
    title: 'Cero comisión por entrada',
    desc: 'No te cobramos un porcentaje de tus ventas. Pagás un precio fijo por evento y listo.',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /></svg>,
  },
  {
    title: 'Tu propio subdominio',
    desc: 'tumarca.parygo.com con tu logo y tus colores. Tu página, no la nuestra.',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
  },
  {
    title: 'Pagás por evento',
    desc: 'Comprás un pack de eventos cuando lo necesitás. Sin suscripción ni ataduras.',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
  },
];

export function ForOrganizers() {
  return (
    <section className="section" id="organizadores" aria-labelledby="org-title">
      <div className="container">
        <div className="section__head center reveal">
          <span className="eyebrow">Para organizadores</span>
          <h2 className="h2" id="org-title">
            Tu evento, <span className="accent">tu marca, tu plata</span>.
          </h2>
          <p style={{ color: 'var(--ink-2)', maxWidth: 580, margin: '14px auto 0', fontSize: '1.05rem', lineHeight: 1.55 }}>
            ParyGo es la plataforma para que vendas las entradas de tus eventos con tu propia marca, cobrando vos directo. Sin intermediarios entre tu público y tu cuenta.
          </p>
        </div>

        <div className="inc-grid reveal-stagger">
          {POINTS.map((p) => (
            <article key={p.title} className="inc">
              <div className="inc__icon" aria-hidden="true">{p.icon}</div>
              <div className="inc__title">{p.title}</div>
              <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 6, lineHeight: 1.45 }}>{p.desc}</p>
            </article>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 32 }} className="reveal">
          <a href={CTA.requestAccess} className="btn btn-primary btn-lg" target="_blank" rel="noopener noreferrer">
            Pedí acceso
          </a>
          <p style={{ color: 'var(--ink-3)', marginTop: 12, fontSize: 14 }}>
            Sumamos organizadores de a pocos para acompañar bien a cada uno. Contanos de tu evento y te damos acceso.
          </p>
        </div>
      </div>
    </section>
  );
}
