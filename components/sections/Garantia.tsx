import { Reveal } from '@/components/anim/Reveal';
import { SplitWords, type Word } from '@/components/anim/SplitWords';
import { CTA } from '@/lib/cta';

const TITLE: Word[] = [
  { t: '7' },
  { t: 'días' },
  { t: 'para' },
  { t: 'confirmar' },
  { t: 'que' },
  { br: true },
  { t: 'encajamos.', italic: true },
];

export function Garantia() {
  return (
    <section
      id="garantia"
      data-screen-label="07 Garantía"
      className="section-y"
      style={{
        background: 'var(--surface)',
        borderTop: '1px dashed var(--border)',
        borderBottom: '1px dashed var(--border)',
      }}
    >
      <div className="wrap grid items-center gap-10 md:grid-cols-[220px_1fr] md:gap-24">
        <div>
          <Reveal>
            <div className="relative w-[200px] h-[200px] seal" aria-hidden="true">
              <svg viewBox="0 0 200 200" width="100%" height="100%">
                <defs>
                  <path
                    id="sealPath2"
                    d="M 100,100 m -78,0 a 78,78 0 1,1 156,0 a 78,78 0 1,1 -156,0"
                    fill="none"
                  />
                </defs>
                <g className="seal-ring">
                  <text
                    fill="#B4B4C0"
                    fontFamily="JetBrains Mono, monospace"
                    fontSize="9"
                    letterSpacing="3.5"
                  >
                    <textPath href="#sealPath2" startOffset="0">
                      GARANTÍA PARYGO · 7 DÍAS · DEVOLUCIÓN 100% · GARANTÍA PARYGO · 7 DÍAS · DEVOLUCIÓN 100% ·{' '}
                    </textPath>
                  </text>
                </g>
                <circle
                  cx="100"
                  cy="100"
                  r="62"
                  fill="none"
                  stroke="#2A2A38"
                  strokeWidth="1"
                />
                <circle
                  cx="100"
                  cy="100"
                  r="40"
                  fill="none"
                  stroke="#FF1F8F"
                  strokeOpacity="0.5"
                  strokeWidth="1"
                  strokeDasharray="2 6"
                />
              </svg>
              <div
                className="absolute inset-0 grid place-items-center serif-plain"
                style={{
                  fontSize: 56,
                  color: 'var(--magenta)',
                  textShadow: '0 0 16px rgba(255,31,143,0.6)',
                }}
              >
                ↻
              </div>
            </div>
          </Reveal>
          <Reveal>
            <div
              className="mt-2 text-center mono"
              style={{ fontSize: 10, letterSpacing: '0.18em', color: 'var(--fg-3)' }}
            >
              ID / GARANTIA-2026
            </div>
          </Reveal>
        </div>

        <div>
          <Reveal>
            <span className="eyebrow mb-5 inline-flex">
              <span className="bracket">[</span> 07 — TU CONFIANZA{' '}
              <span className="bracket">]</span>
            </span>
          </Reveal>
          <SplitWords
            words={TITLE}
            className="h2"
          />
          <Reveal
            as="p"
            className="mt-7 max-w-[50ch] text-[17px] leading-[1.55] md:text-[20px] text-fg"
          >
            Si después de tu primer evento sientes que la plataforma no se adapta a
            cómo operas, devolvemos el 100% del pack completo. Sin preguntas. Sin
            trabas. Sin letra chica.
          </Reveal>
          <Reveal as="p" className="mt-6 mono normal-case text-fg-3">
            Garantía sobre el pack completo · No solo el primer evento
          </Reveal>
          <Reveal>
            <a
              href={CTA.final}
              target="_blank"
              rel="noopener noreferrer"
              data-cursor="hover"
              className="btn btn-outline mt-8"
            >
              Empezar sin riesgo <span className="arrow">→</span>
            </a>
          </Reveal>
        </div>
      </div>

      <style>{`
        .seal:hover .seal-ring { animation-duration: 5s !important; }
        .seal-ring { transform-origin: center; animation: spin 14s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </section>
  );
}
