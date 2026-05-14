import { CTA } from '@/lib/cta';
import { SITE } from '@/lib/site';
import { LiveClock } from '@/components/chrome/LiveClock';
import { Waveform } from '@/components/chrome/Waveform';
import { GiantParallax } from '@/components/anim/GiantParallax';

export function Footer() {
  return (
    <footer
      className="relative overflow-hidden"
      style={{
        paddingTop: 96,
        paddingBottom: 48,
        borderTop: '1px dashed var(--border)',
      }}
      data-screen-label="11 Footer"
    >
      <div className="wrap">
        <div className="grid gap-7 sm:gap-10 md:gap-14 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <a
              href="#top"
              data-cursor="hover"
              className="font-display text-[24px] uppercase tracking-[0.01em] text-fg inline-flex items-center gap-1.5"
            >
              PARYGO
              <span
                className="inline-block w-[7px] h-[7px] rounded-full bg-magenta animate-pulse-m"
                style={{ boxShadow: '0 0 10px var(--magenta)' }}
                aria-hidden="true"
              />
            </a>
            <p className="text-fg-2 text-[14px] leading-[1.55] max-w-[40ch] mt-4">
              Plataforma de ticketing para promotores que operan su marca.
            </p>
            <div className="mono mt-4 inline-flex items-center gap-2.5 normal-case">
              <span className="pg-dot" />
              Aceptando primeros clientes — Lun-Dom 9am-11pm
            </div>
            <Waveform
              bars={15}
              minH={8}
              maxH={24}
              height={24}
              className="mt-4 opacity-40"
            />
          </div>

          <div>
            <h4
              className="mono mb-5"
              style={{ color: 'var(--fg-3)', letterSpacing: '0.2em' }}
            >
              Producto
            </h4>
            <ul className="list-none p-0 flex flex-col gap-3 text-[14px] text-fg-2">
              <li>
                <a href="#servicio" data-cursor="hover" className="link-u hover:text-fg">
                  Servicio
                </a>
              </li>
              <li>
                <a href="#demo" data-cursor="hover" className="link-u hover:text-fg">
                  Demo
                </a>
              </li>
              <li>
                <a href="#funciona" data-cursor="hover" className="link-u hover:text-fg">
                  Características
                </a>
              </li>
              <li>
                <a href="#precios" data-cursor="hover" className="link-u hover:text-fg">
                  Precios
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4
              className="mono mb-5"
              style={{ color: 'var(--fg-3)', letterSpacing: '0.2em' }}
            >
              Paquetes
            </h4>
            <ul className="list-none p-0 flex flex-col gap-3 text-[14px] text-fg-2">
              <li>
                <a
                  href={CTA.pack1}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor="hover"
                  className="link-u hover:text-fg"
                >
                  Pack 1 · S/200
                </a>
              </li>
              <li>
                <a
                  href={CTA.pack3}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor="hover"
                  className="link-u hover:text-fg"
                >
                  Pack 3 · S/540
                </a>
              </li>
              <li>
                <a
                  href={CTA.pack5}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor="hover"
                  className="link-u hover:text-fg"
                >
                  Pack 5 · S/850
                </a>
              </li>
              <li>
                <a
                  href={CTA.pack10}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor="hover"
                  className="link-u hover:text-fg"
                >
                  Pack 10 · S/1,500
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4
              className="mono mb-5"
              style={{ color: 'var(--fg-3)', letterSpacing: '0.2em' }}
            >
              Contacto
            </h4>
            <ul className="list-none p-0 flex flex-col gap-3 text-[14px] text-fg-2">
              <li>
                <a
                  href={CTA.final}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor="hover"
                  className="link-u hover:text-fg"
                >
                  WhatsApp {SITE.whatsappDisplay}
                </a>
              </li>
              <li>
                <span className="text-fg-3">Lima, Perú · LATAM</span>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="mt-16 grid gap-4 pt-7 mono"
          style={{
            borderTop: '1px solid var(--border)',
            gridTemplateColumns: '1fr 1fr 1fr',
            color: 'var(--fg-3)',
            letterSpacing: '0.16em',
          }}
        >
          <span>© 2026 PARYGO · BUILT FOR THE NIGHT</span>
          <span className="text-center">
            v1.0 · LIMA · LIVE <LiveClock withSeconds={false} />
          </span>
          <span className="text-right">−12.0464° S · −77.0428° W</span>
        </div>

        <GiantParallax
          className="font-display uppercase select-none mt-14 flex items-baseline gap-1.5 justify-center"
          amount={28}
        >
          <span
            style={{
              fontSize: 'clamp(120px, 22vw, 280px)',
              lineHeight: 0.82,
              letterSpacing: '-0.05em',
              color: 'var(--surface)',
            }}
          >
            PARYGO
          </span>
          <span
            aria-hidden="true"
            style={{
              width: '0.06em',
              height: '0.06em',
              borderRadius: '50%',
              background: 'var(--magenta)',
              boxShadow: '0 0 24px var(--magenta)',
              display: 'inline-block',
              transform: 'translateY(-0.05em)',
              fontSize: 'clamp(120px, 22vw, 280px)',
            }}
          />
        </GiantParallax>
      </div>
    </footer>
  );
}
