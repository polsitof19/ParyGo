import { Reveal } from '@/components/anim/Reveal';
import { SplitWords, type Word } from '@/components/anim/SplitWords';

const TITLE: Word[] = [
  { t: 'Construido' },
  { t: 'para' },
  { t: 'promotores' },
  { t: 'que' },
  { t: 'operan', italic: true },
  { t: 'su' },
  { t: 'marca.' },
];

const WITHOUT = [
  'URL genérica que no es tuya',
  'Datos de tus compradores fuera de tu alcance',
  'Costos variables que no controlas',
  'Soporte que tarda días en responder',
];

const WITH = [
  'Tu URL, tu marca, tu diseño',
  'Todos los datos en tu dashboard',
  'S/200 fijo por evento, sin sorpresas',
  'WhatsApp directo con respuesta en minutos',
];

function IconX() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="18"
      height="18"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6" />
      <path d="M9 9l6 6" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="18"
      height="18"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function PorQueExistimos() {
  return (
    <section
      id="servicio"
      data-screen-label="02 Por qué existimos"
      className="section-y border-t border-dashed border-border"
    >
      <div className="wrap">
        <header className="mb-20 flex max-w-[920px] flex-col gap-7">
          <Reveal>
            <span className="eyebrow">
              <span className="bracket">[</span> 02 — POR QUÉ EXISTIMOS{' '}
              <span className="bracket">]</span>
            </span>
          </Reveal>
          <SplitWords words={TITLE} className="h2" />
        </header>

        <Reveal
          className="relative grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 left-1/2 hidden w-px md:block"
            style={{
              background:
                'linear-gradient(to bottom, transparent, var(--border) 15%, var(--border) 85%, transparent)',
            }}
          />
          <div>
            <h4
              className="mono mb-8"
              style={{ color: 'var(--fg-3)' }}
            >
              Sin ParyGo
            </h4>
            <ul className="flex flex-col gap-4 list-none p-0 m-0">
              {WITHOUT.map((t) => (
                <li
                  key={t}
                  className="grid items-center gap-3.5 text-[16px] leading-[1.4] md:text-[18px]"
                  style={{ gridTemplateColumns: '22px 1fr', color: 'var(--fg-2)' }}
                >
                  <span className="text-fg-3 grid place-items-center w-[18px] h-[18px]">
                    <IconX />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mono mb-8" style={{ color: 'var(--green)' }}>
              Con ParyGo
            </h4>
            <ul className="flex flex-col gap-4 list-none p-0 m-0">
              {WITH.map((t) => (
                <li
                  key={t}
                  className="grid items-center gap-3.5 text-[16px] leading-[1.4] md:text-[18px] text-fg"
                  style={{ gridTemplateColumns: '22px 1fr' }}
                >
                  <span
                    className="grid place-items-center w-[18px] h-[18px]"
                    style={{
                      color: 'var(--green)',
                      filter: 'drop-shadow(0 0 6px rgba(0,255,136,0.5))',
                    }}
                  >
                    <IconCheck />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
