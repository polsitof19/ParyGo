import { Reveal } from '@/components/anim/Reveal';
import { SplitWords, type Word } from '@/components/anim/SplitWords';

const TITLE: Word[] = [
  { t: 'Así' },
  { t: 'se' },
  { t: 've' },
  { t: 'tu evento', italic: true },
  { br: true },
  { t: 'funcionando.' },
];

const LABELS = [
  { n: '01', t: 'Tu branding al frente' },
  { n: '02', t: 'Tipos de entrada que tú defines' },
  { n: '03', t: 'Capacity meter en tiempo real' },
  { n: '04', t: 'Countdown al evento' },
  { n: '05', t: 'CTA de compra optimizado' },
  { n: '06', t: 'Métodos de pago locales' },
];

export function Demo() {
  return (
    <section
      id="demo"
      data-screen-label="03 Demo visual"
      className="section-y border-t border-dashed border-border"
    >
      <div className="wrap">
        <header className="mb-20 flex max-w-[920px] flex-col gap-7">
          <Reveal>
            <span className="eyebrow">
              <span className="bracket">[</span> 03 — TU EVENTO EN VIVO{' '}
              <span className="bracket">]</span>
            </span>
          </Reveal>
          <SplitWords words={TITLE} className="h2" />
        </header>

        <Reveal className="grid items-start gap-8 md:grid-cols-[minmax(280px,1fr)_minmax(0,1.85fr)] md:gap-16">
          <div className="flex flex-col gap-5">
            {LABELS.map((l, i) => (
              <div
                key={l.n}
                className="grid grid-cols-[56px_1fr] items-center gap-3.5 py-3.5"
                style={{
                  borderTop: '1px solid var(--border)',
                  borderBottom:
                    i === LABELS.length - 1
                      ? '1px solid var(--border)'
                      : undefined,
                }}
              >
                <span
                  className="mono"
                  style={{
                    color: 'var(--magenta)',
                    letterSpacing: '0.16em',
                  }}
                >
                  {l.n}
                </span>
                <span className="text-[15px] leading-[1.4] text-fg">
                  {l.t}
                </span>
              </div>
            ))}
          </div>

          <article
            className="browser overflow-hidden rounded-xl"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            data-cursor="hover"
            data-cursor-big
          >
            <header
              className="flex items-center gap-3 px-4 py-3"
              style={{
                background: 'var(--surface)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span className="flex gap-1.5" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <i
                    key={i}
                    className="block w-[9px] h-[9px] rounded-full"
                    style={{ background: 'var(--border-strong)' }}
                  />
                ))}
              </span>
              <span
                className="flex-1 mono text-fg-2 normal-case"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '5px 14px',
                  letterSpacing: '0.04em',
                }}
              >
                <span className="text-green mr-1.5">●</span>
                clubfoso.parygo.pe
                <span className="text-fg">/density-04</span>
              </span>
            </header>
            <div className="flex flex-col gap-5 px-6 py-6 sm:px-10">
              <div className="flex items-center justify-between mono">
                <span className="inline-flex items-center gap-2 text-fg font-semibold">
                  <span
                    className="inline-block w-[22px] h-[22px] rounded"
                    style={{ background: 'var(--grad)' }}
                    aria-hidden="true"
                  />
                  CLUB FOSO
                </span>
                <span>SAB 24 MAY · 2026</span>
              </div>

              <div
                className="relative grid place-items-center overflow-hidden rounded-[10px]"
                style={{
                  aspectRatio: '16/8',
                  background:
                    'radial-gradient(circle at 70% 30%, rgba(255,31,143,0.6), transparent 50%), radial-gradient(circle at 30% 70%, rgba(0,229,255,0.45), transparent 55%), linear-gradient(135deg, #2a0f3a, #0d1b2e)',
                  border: '1px solid var(--border)',
                }}
              >
                <span
                  className="absolute top-4 right-5 inline-flex items-center gap-1.5 rounded-full mono normal-case"
                  style={{
                    background: 'rgba(0,0,0,0.5)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    padding: '6px 10px',
                    fontSize: 10,
                    color: '#fff',
                  }}
                >
                  <span className="pg-dot pg-dot--c" />
                  Vendiendo ahora
                </span>
                <span
                  className="font-display text-center uppercase leading-[0.9]"
                  style={{
                    fontSize: 'clamp(40px, 5vw, 72px)',
                    color: '#fff',
                    textShadow: '0 4px 30px rgba(0,0,0,0.5)',
                    letterSpacing: '0.02em',
                  }}
                >
                  Density
                  <br />
                  Noche 04
                </span>
                <span
                  className="absolute bottom-4 left-5 mono normal-case"
                  style={{ color: 'rgba(255,255,255,0.85)' }}
                >
                  DJ Headliner · Club Foso · Lima
                </span>
              </div>

              <h3
                className="h3-big"
                style={{ fontSize: 'clamp(28px, 3vw, 48px)' }}
              >
                Density · Noche 04
              </h3>
              <span className="mono normal-case">
                DJ Headliner · Club Foso · Sáb 24 May · 22:00
              </span>

              <div className="mt-2 flex flex-col gap-3">
                {[
                  {
                    name: 'General',
                    price: '— S/40',
                    pct: 84,
                    left: '47 / 300',
                    cyan: false,
                    sold: false,
                  },
                  {
                    name: 'VIP',
                    price: '— S/80',
                    pct: 64,
                    left: '18 / 50',
                    cyan: true,
                    sold: false,
                  },
                  {
                    name: 'Zona VIP',
                    price: '— Agotado',
                    pct: 100,
                    left: '0 / 20',
                    cyan: false,
                    sold: true,
                  },
                ].map((r) => (
                  <div
                    key={r.name}
                    className="grid items-center gap-3.5"
                    style={{
                      gridTemplateColumns: '1fr auto auto',
                      padding: '14px 18px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      opacity: r.sold ? 0.6 : 1,
                    }}
                  >
                    <span className="inline-flex items-center gap-2.5 text-[15px] font-semibold uppercase tracking-[0.04em]">
                      {r.name}{' '}
                      <span
                        className="mono normal-case tracking-[0.04em]"
                        style={{
                          color: r.sold ? 'var(--red)' : 'var(--magenta)',
                        }}
                      >
                        {r.price}
                      </span>
                    </span>
                    {!r.sold && (
                      <span
                        className="relative overflow-hidden rounded-[2px]"
                        style={{
                          width: 130,
                          height: 4,
                          background: 'var(--hover)',
                        }}
                      >
                        <i
                          className="block h-full"
                          style={{
                            width: `${r.pct}%`,
                            background: r.cyan
                              ? 'var(--cyan)'
                              : 'var(--magenta)',
                            boxShadow: r.cyan
                              ? '0 0 8px var(--cyan)'
                              : '0 0 8px var(--magenta)',
                          }}
                        />
                      </span>
                    )}
                    {r.sold && <span aria-hidden />}
                    <span className="mono normal-case tabular-nums text-fg-2">
                      {r.left}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3.5">
                <a
                  href="#precios"
                  className="btn btn-grad"
                  style={{ padding: '16px 26px', fontSize: 14 }}
                >
                  Comprar entrada <span className="arrow">→</span>
                </a>
                <span
                  className="mono normal-case"
                  style={{ letterSpacing: '0.12em', color: 'var(--fg)' }}
                >
                  FALTAN{' '}
                  <strong style={{ color: 'var(--cyan)' }}>
                    04D 12H 38M
                  </strong>
                </span>
              </div>

              <p
                className="mt-2 pt-4 mono normal-case"
                style={{
                  borderTop: '1px dashed var(--border)',
                  fontSize: 10,
                  color: 'var(--fg-3)',
                  letterSpacing: '0.18em',
                }}
              >
                Pagos seguros · Yape · Plin · Visa · Mastercard · Transferencia
                BCP / BBVA
              </p>
            </div>
          </article>
        </Reveal>
      </div>
    </section>
  );
}
