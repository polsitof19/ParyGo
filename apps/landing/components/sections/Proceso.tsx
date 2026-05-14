import { Reveal } from '@/components/anim/Reveal';
import { SplitWords, type Word } from '@/components/anim/SplitWords';

const TITLE: Word[] = [
  { t: 'De' },
  { t: 'idea', italic: true },
  { t: 'a' },
  { t: 'entradas' },
  { br: true },
  { t: 'vendidas' },
  { t: 'en' },
  { t: '24' },
  { t: 'horas.' },
];

type Step = {
  n: string;
  time: string;
  title: string;
  body: string;
  variant: 'magenta' | 'cyan';
  icon: React.ReactNode;
  extra?: React.ReactNode;
};

const STEPS: Step[] = [
  {
    n: '01',
    time: '24 HORAS',
    title: 'Tú envías la info',
    body: 'Formulario con tu marca, fechas, tipos de entrada, fotos. Tú apruebas antes de salir.',
    variant: 'magenta',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>
    ),
  },
  {
    n: '02',
    time: 'EN VIVO',
    title: 'Creamos tu página',
    body: 'URL dedicada, diseño, integraciones de pago. Todo listo y probado para vender.',
    variant: 'cyan',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 9h18" /><path d="M8 14h8" /></svg>
    ),
  },
  {
    n: '03',
    time: 'TIEMPO REAL',
    title: 'Compartes el link',
    body: 'Instagram bio, WhatsApp, stories, redes. Una sola URL para todos los canales.',
    variant: 'magenta',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.59 13.51l6.83 3.98" /><path d="M15.41 6.51l-6.82 3.98" /></svg>
    ),
  },
  {
    n: '04',
    time: 'EN PUERTA',
    title: 'Validamos en puerta',
    body: 'QR único por entrada, app web sin descargas. Tu equipo escanea desde cualquier celular.',
    variant: 'cyan',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3" /><path d="M21 14v3" /><path d="M14 21h7" /></svg>
    ),
    extra: <Minimap />,
  },
];

function Minimap() {
  return (
    <div
      className="relative mt-4 overflow-hidden rounded-lg"
      style={{
        border: '1px solid var(--border)',
        background: 'var(--card)',
        aspectRatio: '16/11',
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 140" width="100%" height="100%">
        <rect width="200" height="140" fill="#14141C" />
        <g stroke="#2A2A38" strokeWidth="1" fill="none">
          <path d="M0 30 L200 30" />
          <path d="M0 70 L200 70" />
          <path d="M0 110 L200 110" />
          <path d="M30 0 L30 140" />
          <path d="M80 0 L80 140" />
          <path d="M140 0 L140 140" />
          <path d="M180 0 L180 140" />
        </g>
        <g fill="#1F1F2A">
          <rect x="32" y="32" width="46" height="36" />
          <rect x="82" y="32" width="56" height="36" />
          <rect x="32" y="72" width="46" height="36" />
          <rect x="82" y="72" width="56" height="36" />
          <rect x="142" y="32" width="36" height="36" />
          <rect x="142" y="72" width="36" height="36" />
        </g>
        <path d="M0 130 L200 20" stroke="#2A2A38" strokeWidth="1.2" />
        <circle cx="120" cy="64" r="14" fill="rgba(255,31,143,0.2)">
          <animate
            attributeName="r"
            values="10;22;10"
            dur="2.2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.5;0;0.5"
            dur="2.2s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          cx="120"
          cy="64"
          r="5"
          fill="#FF1F8F"
          stroke="#fff"
          strokeWidth="1"
        />
      </svg>
      <span
        className="absolute bottom-2 left-2.5 mono"
        style={{
          fontSize: 9,
          letterSpacing: '0.16em',
          color: 'var(--cyan)',
          textShadow: '0 0 6px rgba(0,229,255,0.6)',
        }}
      >
        −12.0464° S · −77.0428° W
      </span>
    </div>
  );
}

export function Proceso() {
  return (
    <section
      id="funciona"
      data-screen-label="04 Cómo funciona"
      className="section-y border-t border-dashed border-border"
    >
      <div className="wrap">
        <header className="mb-20 flex max-w-[920px] flex-col gap-7">
          <Reveal>
            <span className="eyebrow">
              <span className="bracket">[</span> 04 — EL PROCESO{' '}
              <span className="bracket">]</span>
            </span>
          </Reveal>
          <SplitWords words={TITLE} className="h2" />
        </header>

        <Reveal className="relative grid grid-cols-1 gap-12 sm:grid-cols-2 md:grid-cols-4 md:gap-6 timeline">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 right-0 h-px origin-left hidden md:block timeline-line"
            style={{
              top: 96,
              background: 'linear-gradient(to right, var(--magenta), var(--cyan))',
              boxShadow: '0 0 10px rgba(255,31,143,0.4)',
              transform: 'scaleX(0)',
              transition: 'transform 1400ms cubic-bezier(0.16,1,0.3,1)',
              zIndex: 0,
            }}
          />
          {STEPS.map((s, i) => (
            <article
              key={s.n}
              className="relative z-[1] flex flex-col gap-3 pr-5"
              style={{ ['--i' as never]: i }}
            >
              <div
                className="font-display uppercase leading-[0.9]"
                style={{
                  fontSize: 'clamp(64px, 8vw, 110px)',
                  color:
                    s.variant === 'cyan' ? 'var(--cyan)' : 'var(--magenta)',
                  textShadow:
                    s.variant === 'cyan'
                      ? '0 0 18px rgba(0,229,255,0.4)'
                      : '0 0 18px rgba(255,31,143,0.4)',
                }}
              >
                {s.n}
              </div>
              <div
                className={`w-2.5 h-2.5 rounded-full mt-1.5 mb-2 ${
                  s.variant === 'cyan' ? 'animate-pulse-c' : 'animate-pulse-m'
                }`}
                style={{
                  background:
                    s.variant === 'cyan' ? 'var(--cyan)' : 'var(--magenta)',
                  boxShadow:
                    s.variant === 'cyan'
                      ? '0 0 10px var(--cyan)'
                      : '0 0 10px var(--magenta)',
                }}
              />
              <div
                className="mono"
                style={{
                  color: 'var(--yellow)',
                  letterSpacing: '0.2em',
                  fontSize: 11,
                }}
              >
                {s.time}
              </div>
              <h3 className="font-semibold leading-tight tracking-[-0.01em] text-[18px] md:text-[22px]">
                {s.title}
              </h3>
              <p className="text-[14px] leading-[1.5] text-fg-2 max-w-[32ch]">
                {s.body}
              </p>
              <div
                className="mt-2"
                style={{
                  color:
                    s.variant === 'cyan' ? 'var(--cyan)' : 'var(--magenta)',
                  width: 22,
                  height: 22,
                }}
              >
                {s.icon}
              </div>
              {s.extra}
            </article>
          ))}
        </Reveal>

        <style>{`
          .timeline.in .timeline-line { transform: scaleX(1) !important; }
        `}</style>
      </div>
    </section>
  );
}
