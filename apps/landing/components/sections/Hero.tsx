import { CTA } from '@/lib/cta';
import { TicketCanvas } from '@/components/decorative/TicketCanvas';

// Splits a phrase into <span.word> with a sequential --w index so the CSS can
// reveal each word in turn (refinamiento 2). `start` keeps the index running
// across the whole title. The space between words is emitted as a SEPARATE text
// node (not inside the span): `.word` is display:inline-block, which collapses
// whitespace at its edges — putting the space inside ran the words together
// ("tudinero"). A sibling text node renders the gap correctly.
function words(text: string, start: number) {
  const parts = text.split(' ');
  const nodes: React.ReactNode[] = [];
  parts.forEach((p, i) => {
    nodes.push(
      <span className="word" style={{ ['--w' as string]: start + i }} key={`${start}-${i}`}>
        {p}
      </span>
    );
    if (i < parts.length - 1) nodes.push(' ');
  });
  return { next: start + parts.length, nodes };
}

// 01 — Hero
export function Hero() {
  const l1 = words('Tus eventos,', 0);
  const l2 = words('tus entradas,', l1.next);
  const l3 = words('tu dinero', l2.next);

  return (
    <section className="section hero" aria-labelledby="hero-title">
      <div className="hero__blobs" aria-hidden="true">
        <div className="b1" />
        <div className="b2" />
        <div className="b3" />
      </div>

      <div className="container hero__inner">
        <div className="hero__grid">
          <div>
            <span className="eyebrow reveal">Vende entradas en Perú</span>
            <h1 className="h1 hero__title" id="hero-title">
              <span className="ink">{l1.nodes}</span>
              <br />
              {l2.nodes}
              <br />
              <span className="squiggle accent">{l3.nodes}</span>
              <span className="word" style={{ ['--w' as string]: l3.next }}>.</span>
            </h1>
            <p className="lede hero__sub reveal">
              Discotecas, conciertos, fiestas, cumpleaños. Vende entradas, cobra directo y controla quién entra.
            </p>
            <div className="hero__ctas reveal">
              <a href={CTA.hero} className="btn btn-primary btn-lg" target="_blank" rel="noopener noreferrer">
                Empezar <span className="arrow" aria-hidden="true">→</span>
              </a>
              <a href="#como" className="btn btn-ghost">
                <span className="ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" /></svg>
                </span>
                Ver cómo funciona
              </a>
            </div>
            <div className="hero__chips reveal">
              <span className="chip"><span className="tick" aria-hidden="true">✓</span> Pagos directo a ti</span>
              <span className="chip"><span className="tick" aria-hidden="true">✓</span> Yape y tarjeta</span>
              <span className="chip"><span className="tick" aria-hidden="true">✓</span> Cero comisión por entrada</span>
            </div>
          </div>

          <div className="hero__visual reveal" id="heroVisual">
            <div className="blob-back" aria-hidden="true" />
            <span className="hero__spark s1" aria-hidden="true">✦</span>
            <span className="hero__spark s2" aria-hidden="true">✦</span>
            {/* Static fallback (reduced-motion / no-WebGL / pre-load). Hidden once .has3d. */}
            <div className="fallback" aria-hidden="true">
              <svg viewBox="0 0 240 150" width="80%" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="14" width="228" height="122" rx="18" fill="#fff" />
                <line x1="160" y1="14" x2="160" y2="136" stroke="#EFE6D6" strokeWidth="2" strokeDasharray="5 5" />
                <text x="30" y="52" fontFamily="var(--display)" fontWeight="800" fontSize="22" fill="#231C17">PARYGO</text>
                <text x="30" y="80" fontFamily="var(--body)" fontSize="11" fill="#6B5F54">ADMIT ONE</text>
                <rect x="30" y="94" width="90" height="8" rx="4" fill="#FF6A3D" />
                <rect x="178" y="44" width="40" height="40" rx="8" fill="#231C17" />
              </svg>
            </div>
            <TicketCanvas mountId="heroVisual" />
          </div>
        </div>
      </div>
    </section>
  );
}
