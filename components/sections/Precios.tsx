import { Reveal } from '@/components/anim/Reveal';
import { SplitWords, type Word } from '@/components/anim/SplitWords';
import { Tilt } from '@/components/anim/Tilt';
import { CTA } from '@/lib/cta';

const TITLE: Word[] = [
  { t: 'Elige' },
  { t: 'tu paquete.', italic: true },
];

type Plan = {
  id: string;
  tier: string;
  name: string;
  qty: string;
  price: string;
  strike?: string;
  per: string;
  bullets: string[];
  cta: { href: string; label: string; grad?: boolean };
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    id: 'TKT/001',
    tier: '01',
    name: 'Party',
    qty: '1 evento',
    price: 'S/200',
    per: 'S/200 por evento',
    bullets: [
      'Setup completo en 24h',
      'Página con tu marca',
      'Garantía 7 días',
    ],
    cta: { href: CTA.pack1, label: 'Empezar 1 evento' },
  },
  {
    id: 'TKT/003',
    tier: '02',
    name: 'Regular',
    qty: '3 eventos',
    price: 'S/540',
    strike: 'S/600',
    per: 'S/180 × evento — ahorras S/60',
    bullets: [
      'Todo lo de Party',
      'Capacitación incluida',
      'Soporte prioritario',
    ],
    cta: { href: CTA.pack3, label: 'Comprar Pack 3' },
  },
  {
    id: 'TKT/005',
    tier: '03',
    name: 'Pro',
    qty: '5 eventos',
    price: 'S/850',
    strike: 'S/1,000',
    per: 'S/170 × evento — ahorras S/150',
    bullets: [
      'Todo lo de Regular',
      'Manager de cuenta dedicado',
      'Capacitación 1:1 por Zoom',
      'Setup premium incluido',
    ],
    cta: { href: CTA.pack5, label: 'Comprar Pack 5', grad: true },
    featured: true,
  },
  {
    id: 'TKT/010',
    tier: '04',
    name: 'Frequency',
    qty: '10 eventos',
    price: 'S/1,500',
    strike: 'S/2,000',
    per: 'S/150 × evento — ahorras S/500',
    bullets: [
      'Todo lo de Pro',
      'Onboarding presencial en Lima',
      'Review trimestral de performance',
      'Plan custom de marketing',
    ],
    cta: { href: CTA.pack10, label: 'Comprar Pack 10' },
  },
];

export function Precios() {
  return (
    <section
      id="precios"
      data-screen-label="06 Precios"
      className="section-y border-t border-dashed border-border"
    >
      <div className="wrap">
        <header className="mb-20 flex max-w-[920px] flex-col gap-7">
          <Reveal>
            <span className="eyebrow">
              <span className="bracket">[</span> 06 — PAQUETES{' '}
              <span className="bracket">]</span>
            </span>
          </Reveal>
          <SplitWords words={TITLE} className="h2" />
          <Reveal as="p" className="body-lg">
            Pago único por evento. Sin comisiones por venta. Garantía de 7 días en tu
            primer evento.
          </Reveal>
        </header>

        <Reveal
          variant="reveal-stagger"
          className="grid gap-7 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        >
          {PLANS.map((p) => (
            <Tilt
              key={p.id}
              className={`plan ${p.featured ? 'plan--featured' : ''}`}
            >
              <div
                className="relative flex flex-col gap-3 px-6 pt-7 pb-6"
                style={{
                  background: p.featured
                    ? 'linear-gradient(180deg, rgba(255,31,143,0.06), var(--card) 35%)'
                    : 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  minHeight: 540,
                  isolation: 'isolate',
                }}
              >
                {/* notches */}
                <span
                  className="absolute left-[-7px] w-3 h-3 rounded-full z-[1]"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    top: '62%',
                  }}
                  aria-hidden="true"
                />
                <span
                  className="absolute right-[-7px] w-3 h-3 rounded-full z-[1]"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    top: '62%',
                  }}
                  aria-hidden="true"
                />
                <span
                  className="absolute left-2 right-2 h-px z-0"
                  style={{
                    top: 'calc(62% + 6px)',
                    borderTop: '1px dashed var(--border-strong)',
                  }}
                  aria-hidden="true"
                />

                {p.featured && (
                  <>
                    <span
                      className="plan-border pointer-events-none absolute inset-0 rounded-xl z-0"
                      aria-hidden="true"
                      style={{
                        padding: 1,
                        background:
                          'conic-gradient(from var(--pg-angle), var(--magenta), var(--cyan), var(--magenta))',
                        WebkitMask:
                          'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                        mask:
                          'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                        WebkitMaskComposite: 'xor',
                        maskComposite: 'exclude',
                        animation: 'pgAngleSpin 60s linear infinite',
                      }}
                    />
                    <span
                      className="absolute right-3.5 top-[-12px] rounded-full mono font-bold z-[3]"
                      style={{
                        background: 'var(--yellow)',
                        color: '#000',
                        padding: '5px 12px',
                        fontSize: 10,
                        letterSpacing: '0.18em',
                        transform: 'rotate(3deg)',
                      }}
                    >
                      ★ Más elegido
                    </span>
                  </>
                )}

                <div className="flex items-start justify-between mb-1">
                  <div>
                    <div
                      className="font-display uppercase leading-none"
                      style={{
                        fontSize: 'clamp(22px, 2vw, 28px)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {p.name}
                    </div>
                    <div
                      className="mono mt-1"
                      style={{ letterSpacing: '0.2em' }}
                    >
                      {p.qty}
                    </div>
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      color: 'var(--fg-3)',
                    }}
                  >
                    {p.id}
                  </div>
                </div>

                <div className="flex items-baseline gap-2.5 mt-1.5">
                  <span
                    className="font-display leading-[0.9] tabular-nums"
                    style={{
                      fontSize: 'clamp(56px, 6vw, 88px)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {p.price}
                  </span>
                  {p.strike && (
                    <span
                      className="font-display"
                      style={{
                        fontSize: 22,
                        color: 'var(--fg-3)',
                        textDecoration: 'line-through',
                        textDecorationThickness: '2px',
                      }}
                    >
                      {p.strike}
                    </span>
                  )}
                </div>
                <span
                  className="mono normal-case"
                  style={{
                    color: p.strike ? 'var(--cyan)' : 'var(--fg-3)',
                    letterSpacing: p.strike ? '0.10em' : '0.14em',
                    textShadow: p.strike
                      ? '0 0 6px rgba(0,229,255,0.4)'
                      : undefined,
                  }}
                >
                  {p.per}
                </span>

                <ul className="list-none p-0 mt-4 flex flex-col gap-2.5 text-[14px] text-fg-2">
                  {p.bullets.map((b) => (
                    <li
                      key={b}
                      className="grid gap-2.5 items-start leading-[1.45]"
                      style={{ gridTemplateColumns: '14px 1fr' }}
                    >
                      <span
                        className="mono mt-0.5"
                        style={{
                          color: 'var(--green)',
                          textShadow: '0 0 6px rgba(0,255,136,0.5)',
                          fontSize: 12,
                        }}
                      >
                        ✓
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-4 relative z-[2]">
                  <a
                    href={p.cta.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-cursor="hover"
                    className={`btn w-full justify-center ${p.cta.grad ? 'btn-grad' : 'btn-outline'}`}
                  >
                    {p.cta.label}
                    {p.cta.grad && <span className="arrow">→</span>}
                  </a>
                </div>
              </div>
            </Tilt>
          ))}
        </Reveal>

        <Reveal as="p" className="mt-9 text-center mono normal-case">
          <span style={{ letterSpacing: '0.16em' }}>
            Pago único <span className="text-fg-3">·</span> Vigencia 12 meses{' '}
            <span className="text-fg-3">·</span> Boleta o factura
          </span>
        </Reveal>
        <Reveal
          as="p"
          className="mt-4 text-center text-[14px] text-fg-2 leading-relaxed mx-auto"
        >
          <span style={{ maxWidth: '60ch', display: 'inline-block' }}>
            Los pagos de las entradas van directo a tu cuenta MercadoPago, Yape o
            transferencia bancaria. Nosotros nunca tocamos el dinero de tus
            ventas. Tú controlas el precio de cada entrada y los porcentajes de
            cada tipo.
          </span>
        </Reveal>
        <Reveal className="mt-7 flex flex-wrap items-center justify-between gap-4 px-7 py-6 max-w-[920px] mx-auto"
          as="div"
        >
          <div
            className="flex flex-wrap items-center justify-between gap-4 w-full"
            style={{ borderLeft: '2px solid var(--magenta)', paddingLeft: 20 }}
          >
            <p className="text-[15px] text-fg">
              ¿Productora con +10 eventos al año? Conversemos un plan custom.
            </p>
            <a
              href={CTA.final}
              target="_blank"
              rel="noopener noreferrer"
              data-cursor="hover"
              className="link-u text-magenta"
            >
              → WhatsApp
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
