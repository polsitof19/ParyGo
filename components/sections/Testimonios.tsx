import { Reveal } from '@/components/anim/Reveal';
import { SplitWords, type Word } from '@/components/anim/SplitWords';

const TITLE: Word[] = [
  { t: 'Lo' },
  { t: 'que' },
  { t: 'dirán', italic: true },
  { t: 'los' },
  { t: 'primeros.' },
];

// First testimonials are not yet available — we don't fabricate them. This
// section shows a clear placeholder card so future clients see the slot
// exists and current visitors get an honest read of where we are.
const PLANNED_DATE = '13 de junio de 2026';

export function Testimonios() {
  return (
    <section
      id="testimonios"
      data-screen-label="07 Testimonios"
      className="section-y border-t border-dashed border-border"
    >
      <div className="wrap">
        <header className="mb-16 flex max-w-[920px] flex-col gap-7">
          <Reveal>
            <span className="eyebrow">
              <span className="bracket">[</span> 07 — TESTIMONIOS{' '}
              <span className="bracket">]</span>
            </span>
          </Reveal>
          <SplitWords words={TITLE} className="h2" />
          <Reveal as="p" className="body-lg">
            ParyGo recién abre puertas en 2026. Cuando los primeros eventos
            corran su producción con la plataforma, sus testimonios reales
            ocuparán este espacio. No inventamos clientes.
          </Reveal>
        </header>

        <Reveal>
          <article
            className="relative grid items-start gap-7 p-8 md:grid-cols-[88px_1fr] md:gap-10 md:p-12"
            style={{
              background: 'var(--card)',
              border: '1px dashed var(--border-strong)',
              borderRadius: 12,
              maxWidth: 920,
              margin: '0 auto',
            }}
          >
            {/* corner ticks */}
            {(
              [
                ['top', 'left'],
                ['top', 'right'],
                ['bottom', 'left'],
                ['bottom', 'right'],
              ] as const
            ).map(([v, h]) => (
              <span
                key={`${v}-${h}`}
                aria-hidden="true"
                className="absolute pointer-events-none"
                style={{
                  [v]: 8,
                  [h]: 8,
                  width: 12,
                  height: 12,
                }}
              >
                <span
                  className="absolute"
                  style={{
                    left: 5,
                    top: 0,
                    width: 1,
                    height: 12,
                    background: 'var(--magenta)',
                    opacity: 0.5,
                  }}
                />
                <span
                  className="absolute"
                  style={{
                    top: 5,
                    left: 0,
                    width: 12,
                    height: 1,
                    background: 'var(--magenta)',
                    opacity: 0.5,
                  }}
                />
              </span>
            ))}

            <div
              className="relative grid place-items-center"
              style={{
                width: 88,
                height: 88,
                borderRadius: '50%',
                background:
                  'radial-gradient(circle at 30% 30%, rgba(255,31,143,0.18), transparent 60%), radial-gradient(circle at 70% 70%, rgba(0,229,255,0.12), transparent 65%), var(--surface)',
                border: '1px solid var(--border-strong)',
              }}
              aria-hidden="true"
            >
              <span
                className="serif-plain"
                style={{
                  fontSize: 48,
                  color: 'var(--magenta)',
                  textShadow: '0 0 12px rgba(255,31,143,0.4)',
                  lineHeight: 1,
                  transform: 'translateY(6px)',
                }}
              >
                ?
              </span>
            </div>

            <div>
              <span
                className="mono inline-flex items-center gap-2 mb-5 normal-case"
                style={{ color: 'var(--cyan)', letterSpacing: '0.18em' }}
              >
                <span className="pg-dot pg-dot--c" />
                Slot reservado · primer cliente
              </span>
              <p
                className="serif-plain mb-4"
                style={{
                  fontSize: 'clamp(22px, 2.4vw, 32px)',
                  color: 'var(--fg)',
                  lineHeight: 1.35,
                  maxWidth: '46ch',
                }}
              >
                "Próximamente: testimonio de nuestro primer cliente.
                Su evento se realiza el {PLANNED_DATE} con ParyGo."
              </p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mono">
                <span style={{ color: 'var(--fg-2)' }}>NOMBRE · TBD</span>
                <span style={{ color: 'var(--fg-3)' }}>·</span>
                <span style={{ color: 'var(--fg-2)' }}>ROL · TBD</span>
                <span style={{ color: 'var(--fg-3)' }}>·</span>
                <span style={{ color: 'var(--fg-2)' }}>EVENTO · TBD</span>
              </div>
            </div>
          </article>
        </Reveal>

        <Reveal>
          <p
            className="mt-8 text-center mono normal-case mx-auto"
            style={{
              color: 'var(--fg-3)',
              letterSpacing: '0.16em',
              maxWidth: '60ch',
            }}
          >
            ¿Quieres ser nuestro primer caso? Tu logo y testimonio entran aquí
            con el primer pack.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
