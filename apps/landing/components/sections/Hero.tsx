import { Reveal } from '@/components/anim/Reveal';
import { SplitWords, type Word } from '@/components/anim/SplitWords';
import { Magnet } from '@/components/anim/Magnet';
import { LiveClock } from '@/components/chrome/LiveClock';
import { Waveform } from '@/components/chrome/Waveform';
import { PhoneMockup } from '@/components/decorative/PhoneMockup';
import { CTA } from '@/lib/cta';

const TITLE: Word[] = [
  { t: 'El' },
  { t: 'ticketing' },
  { br: true },
  { t: 'que' },
  { t: 'tu' },
  { t: 'marca' },
  { br: true },
  { t: 'merece.', italic: true },
];

export function Hero() {
  return (
    <section
      id="top"
      data-screen-label="01 Hero"
      className="section-y relative overflow-hidden pt-[140px] pb-24"
    >
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
        <div
          className="absolute"
          style={{
            inset: '-10%',
            background:
              'radial-gradient(circle at 75% 25%, rgba(255,31,143,0.18), transparent 50%), radial-gradient(circle at 20% 80%, rgba(0,229,255,0.10), transparent 55%), radial-gradient(circle at 50% 50%, rgba(185,33,255,0.08), transparent 60%)',
            filter: 'blur(20px)',
            animation: 'mesh-drift 180s linear infinite',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(42,42,56,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(42,42,56,0.4) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            maskImage:
              'radial-gradient(ellipse at 50% 45%, #000 0%, transparent 70%)',
            WebkitMaskImage:
              'radial-gradient(ellipse at 50% 45%, #000 0%, transparent 70%)',
          }}
        />
      </div>

      <div className="wrap relative z-[1]">
        <div className="mb-16 grid items-start gap-6 md:grid-cols-[auto_1fr_auto]">
          <Reveal>
            <span
              className="inline-flex items-center gap-1.5 rounded-full mono font-bold"
              style={{
                background: 'var(--yellow)',
                color: '#000',
                padding: '6px 12px',
                fontSize: 10,
                transform: 'rotate(-3deg)',
              }}
            >
              ★ Disponible en Lima
            </span>
          </Reveal>
          <span aria-hidden="true" />
          <Reveal>
            <div className="mono flex flex-col items-start gap-1 leading-[1.7] md:items-end md:text-right">
              <span className="inline-flex items-center gap-2">
                <span className="pg-dot" />
                LIMA, PE — LIVE <LiveClock />
              </span>
              <span>−12.0464° S · −77.0428° W</span>
              <span>Ticketing urbano · v1.0</span>
            </div>
          </Reveal>
        </div>

        <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.8fr)] md:gap-16">
          <div>
            <Reveal className="mb-8 inline-flex">
              <span className="eyebrow">
                <span className="bracket">[</span> TICKETING URBANO · LIMA + LATAM{' '}
                <span className="bracket">]</span>
              </span>
            </Reveal>

            <SplitWords
              as="h1"
              className="h1 relative z-[2] mb-9"
              words={TITLE}
            />

            <Reveal className="body-lg max-w-[50ch] mb-10">
              Plataforma con tu identidad, tu URL, tu control. Página dedicada,
              QR único por entrada, validación en vivo en puerta. S/200 por
              evento. Sin comisiones por venta.
            </Reveal>

            <Reveal className="flex flex-wrap items-center gap-6 mb-16">
              <Magnet>
                <a
                  href={CTA.hero}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor="hover"
                  className="btn btn-grad btn-xl"
                >
                  Empezar ahora <span className="arrow">→</span>
                </a>
              </Magnet>
              <a
                href="#funciona"
                data-cursor="hover"
                className="btn btn-ghost"
              >
                Ver cómo funciona ↓
              </a>
            </Reveal>

            <Reveal
              className="flex flex-wrap items-center gap-6 pt-7 mono"
              as="div"
            >
              <span style={{ borderTop: '1px solid var(--border)', position: 'absolute' }} className="hidden" />
              <span>24H · SETUP COMPLETO</span>
              <span className="text-fg-3">/</span>
              <span>0% · COMISIÓN POR ENTRADA</span>
              <span className="text-fg-3">/</span>
              <span>2026 · ACEPTANDO PRIMEROS CLIENTES</span>
            </Reveal>
          </div>

          <div className="relative">
            <PhoneMockup />
            <Waveform
              bars={32}
              minH={12}
              maxH={36}
              className="absolute right-0 -bottom-8 z-[2] opacity-50"
            />
          </div>
        </div>

        <div
          className="mt-14 flex flex-col items-start justify-between gap-4 pt-7 md:flex-row md:items-center mono"
          style={{
            borderTop: '1px dashed var(--border)',
            color: 'var(--fg-3)',
            letterSpacing: '0.16em',
          }}
        >
          <span>
            <span className="animate-bob inline-block text-cyan">↓</span> SCROLL TO
            EXPLORE
          </span>
          <span>N° 01 / 10</span>
        </div>
      </div>
    </section>
  );
}
