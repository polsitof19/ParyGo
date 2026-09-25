import { CTA } from '@/lib/cta';

// 06 — Precios (4 packs; todos incluyen todo, solo cambia la cantidad)
type Plan = {
  name: string;
  qty: string;
  price: string;
  percu: string;
  perks: string[];
  href: string;
  rec?: boolean;
  btn: string;
};

// Precios = apps/web/lib/packs.ts (lo que cobra /admin/comprar). Son dos apps
// separadas: si cambias uno, cambia el otro (y StructuredData + site.ts).
const PLANS: Plan[] = [
  { name: '1 Evento', qty: 'Para probar', price: '150', percu: 'S/150 c/u', perks: ['Todas las funciones', 'Entradas ilimitadas', 'Soporte incluido'], href: CTA.pack1, btn: 'btn-soft' },
  { name: '3 Eventos', qty: 'Ahorras S/60', price: '390', percu: 'S/130 c/u', perks: ['Todas las funciones', 'Entradas ilimitadas', 'Soporte prioritario'], href: CTA.pack3, rec: true, btn: 'btn-primary' },
  { name: '5 Eventos', qty: 'Ahorras S/150', price: '600', percu: 'S/120 c/u', perks: ['Todas las funciones', 'Entradas ilimitadas', 'Acompañamiento 1:1'], href: CTA.pack5, btn: 'btn-soft' },
  { name: '10 Eventos', qty: 'Ahorras S/400', price: '1,100', percu: 'S/110 c/u', perks: ['Todas las funciones', 'Entradas ilimitadas', 'Onboarding presencial'], href: CTA.pack10, btn: 'btn-soft' },
];

export function Pricing() {
  return (
    <section className="section pricing" id="precios" aria-labelledby="pricing-title">
      <div className="container">
        <div className="section__head center reveal">
          <span className="eyebrow">Precios claros</span>
          <h2 className="h2" id="pricing-title">Pagas una vez por evento.</h2>
        </div>

        <div style={{ textAlign: 'center' }} className="reveal">
          <span className="plans-banner">
            <span className="star" aria-hidden="true">★</span> Todos los packs incluyen todas las funciones. Solo eliges cuántos eventos necesitas.
          </span>
        </div>

        <div className="plans reveal-stagger">
          {PLANS.map((p) => (
            <article key={p.name} className={`plan${p.rec ? ' plan--rec' : ''}`}>
              {p.rec && <span className="plan__badge">⭐ Más popular</span>}
              <div className="plan__name">{p.name}</div>
              <div className="plan__qty">{p.qty}</div>
              <div className="plan__price"><span className="cur">S/</span>{p.price}</div>
              <span className="plan__percu">{p.percu}</span>
              <ul className="plan__list">
                {p.perks.map((perk) => (
                  <li key={perk}><span className="tick" aria-hidden="true">✓</span>{perk}</li>
                ))}
              </ul>
              <div className="plan__cta">
                <a href={p.href} className={`btn ${p.btn}`}>Elegir</a>
              </div>
            </article>
          ))}
        </div>

        <p className="plans-note reveal">
          Un evento = un evento completo, con entradas ilimitadas y todas las funciones.
        </p>
      </div>
    </section>
  );
}
