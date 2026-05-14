import { Reveal } from '@/components/animations/Reveal';
import { TicketStub } from '@/components/decorative/TicketStub';
import { CTA } from '@/lib/cta';

export function Hero() {
  return (
    <section
      id="top"
      className="wrap relative flex min-h-screen flex-col justify-between pb-20 pt-[200px]"
    >
      <span
        className="pointer-events-none absolute select-none text-[#EFEDE6] serif-i z-0"
        style={{
          right: 'var(--pad-x)',
          top: '22vh',
          fontSize: 'clamp(220px, 38vw, 520px)',
          lineHeight: '0.8',
          letterSpacing: '-0.04em',
        }}
        aria-hidden="true"
      >
        01
      </span>

      <div className="relative z-[2] flex items-start justify-between gap-6">
        <Reveal>
          <div className="mono">[ 01 — PLATAFORMA ]</div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="mono text-right leading-[1.7]">
            <div>
              <span className="mr-1.5 inline-block h-[6px] w-[6px] -translate-y-[1px] animate-soft-pulse rounded-full bg-accent-green align-middle" />
              BASED IN LIMA, PE
            </div>
            <div style={{ color: 'var(--fg-muted)' }}>EST. 2026 / DISPONIBLE</div>
          </div>
        </Reveal>
      </div>

      <div className="relative z-[2] mt-20 grid grid-cols-1 gap-12 lg:grid-cols-[1.6fr_1fr] lg:items-end lg:gap-16">
        <div className="max-w-[1280px]">
          <Reveal as="h1" className="h-hero mb-12">
            Tu propio ticketing.
            <br />
            Sin <span className="serif-i">comisiones</span>.
          </Reveal>

          <div className="grid grid-cols-1 items-end gap-10 md:grid-cols-[1fr_auto] md:gap-16">
            <Reveal as="p" delay={0.08} className="max-w-[44ch] text-[17px] leading-[1.5] text-fg-muted md:text-[20px]">
              Plataforma de ticketing con tu marca propia. Página dedicada, QR
              único por entrada, validación en vivo. Desde S/200 por evento.
            </Reveal>
            <Reveal delay={0.16}>
              <div className="flex flex-wrap items-center gap-6">
                <a
                  href={CTA.hero}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                >
                  Conocer plataforma <span className="arrow">→</span>
                </a>
                <a href="#packs" className="btn btn-ghost">
                  <span className="u">Ver packs</span>
                </a>
              </div>
            </Reveal>
          </div>
        </div>

        <Reveal delay={0.24} y={32} className="hidden lg:block">
          <div className="relative rotate-[-3deg] transition-transform duration-700 hover:rotate-0">
            <TicketStub />
          </div>
        </Reveal>
      </div>

      <div className="relative z-[2] mt-24 flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
        <Reveal>
          <a href="#manifiesto" className="mono inline-flex items-center gap-2.5">
            <span className="inline-block animate-bob">↓</span> SCROLL PARA EXPLORAR
          </a>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="mono flex flex-wrap gap-12 text-fg-muted">
            <span>
              DESDE
              <strong className="mt-1 block text-[14px] font-medium tracking-[-0.01em] text-fg normal-case">
                S/200 / evento
              </strong>
            </span>
            <span>
              COMISIÓN
              <strong className="mt-1 block text-[14px] font-medium tracking-[-0.01em] text-fg normal-case">
                0%
              </strong>
            </span>
            <span>
              QR
              <strong className="mt-1 block text-[14px] font-medium tracking-[-0.01em] text-fg normal-case">
                Único por entrada
              </strong>
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
