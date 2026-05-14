import Image from 'next/image';
import { Reveal } from '@/components/anim/Reveal';
import { SplitWords, type Word } from '@/components/anim/SplitWords';
import { LiveClock } from '@/components/chrome/LiveClock';

const TITLE: Word[] = [
  { t: 'Hecho' },
  { t: 'por' },
  { t: 'promotores,' },
  { br: true },
  { t: 'para' },
  { t: 'promotores.', italic: true },
];

// Founder portrait placeholder.
// TODO(founder-photo): swap `src` to a real photo at /public/founder.jpg
// (or .webp). Recommended: square 800×800, exported under 200 KB.
const PORTRAIT_SRC: string | null = null;

export function Fundador() {
  return (
    <section
      id="fundador"
      data-screen-label="09 Fundador"
      className="section-y border-t border-dashed border-border"
    >
      <div className="wrap grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-20">
        <Reveal>
          <div
            className="relative w-full max-w-[420px] mx-auto md:mx-0 aspect-square overflow-hidden"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
            }}
          >
            {PORTRAIT_SRC ? (
              <Image
                src={PORTRAIT_SRC}
                alt="Fundador de ParyGo"
                fill
                sizes="(max-width: 768px) 100vw, 420px"
                className="object-cover"
              />
            ) : (
              <>
                {/* Procedural placeholder — replace with real photo */}
                <span
                  className="absolute inset-0"
                  aria-hidden="true"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 12px), radial-gradient(circle at 30% 30%, rgba(255,31,143,0.12), transparent 55%), radial-gradient(circle at 70% 70%, rgba(0,229,255,0.08), transparent 55%)',
                  }}
                />
                <span
                  className="absolute inset-6 grid place-items-center"
                  style={{
                    border: '1px dashed var(--border-strong)',
                    borderRadius: 8,
                  }}
                >
                  <div className="text-center">
                    <div className="mono mb-3" style={{ color: 'var(--cyan)' }}>
                      [ PLACEHOLDER ]
                    </div>
                    <div
                      className="font-display uppercase"
                      style={{
                        fontSize: 28,
                        color: 'var(--fg)',
                        letterSpacing: '0.02em',
                        lineHeight: 1,
                      }}
                    >
                      Foto del
                      <br />
                      fundador
                    </div>
                    <div
                      className="mono mt-4"
                      style={{ color: 'var(--fg-3)', letterSpacing: '0.18em' }}
                    >
                      Reemplazar en /public
                    </div>
                  </div>
                </span>
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
                    className="absolute"
                    style={{
                      [v]: 10,
                      [h]: 10,
                      width: 10,
                      height: 10,
                    }}
                  >
                    <span
                      className="absolute"
                      style={{
                        left: 4,
                        top: 0,
                        width: 1,
                        height: 10,
                        background: 'var(--border-strong)',
                      }}
                    />
                    <span
                      className="absolute"
                      style={{
                        top: 4,
                        left: 0,
                        width: 10,
                        height: 1,
                        background: 'var(--border-strong)',
                      }}
                    />
                  </span>
                ))}
              </>
            )}
          </div>
        </Reveal>

        <div>
          <Reveal>
            <span className="eyebrow mb-6 inline-flex">
              <span className="bracket">[</span> 09 — FUNDADOR{' '}
              <span className="bracket">]</span>
            </span>
          </Reveal>
          <SplitWords words={TITLE} className="h2" />
          <Reveal
            as="p"
            className="body-lg mt-7 max-w-[52ch] text-fg"
          >
            ParyGo nace en Lima en 2026, con la idea de devolver el control del
            ticketing a quien lo construye: los promotores. Sin intermediarios
            tomando porcentaje, sin marcas ajenas tapando la tuya, sin
            sorpresas en la liquidación.
          </Reveal>
          <Reveal
            as="p"
            className="mt-6 max-w-[52ch] text-[16px] leading-[1.55] text-fg-2"
          >
            Cada decisión de la plataforma sale de operar eventos en la calle,
            no de un brainstorm de oficina. Si conoces el dolor de armar una
            puerta, recibir un Yape, validar QR en celular bajo lluvia o cuadrar
            stock entre staff — esta plataforma se construyó pensando en ese
            día.
          </Reveal>

          <div className="mt-10 flex flex-wrap gap-x-10 gap-y-4 mono">
            <span className="inline-flex items-center gap-2">
              <span className="pg-dot" />
              Lima, PE · LIVE <LiveClock />
            </span>
            <span style={{ color: 'var(--fg-3)' }}>EST. 2026</span>
            <span style={{ color: 'var(--fg-3)' }}>
              −12.0464° S · −77.0428° W
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
