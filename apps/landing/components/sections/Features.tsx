import { Reveal } from '@/components/anim/Reveal';
import { SplitWords, type Word } from '@/components/anim/SplitWords';
import { Tilt } from '@/components/anim/Tilt';

const TITLE: Word[] = [
  { t: 'Cada' },
  { t: 'evento' },
  { t: 'incluye' },
  { t: 'todo.', italic: true },
];

type Feature = {
  variant: 'magenta' | 'cyan';
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    variant: 'magenta',
    eyebrow: 'Página con tu marca',
    title: 'URL dedicada',
    body: 'Tus colores, tu cover, tu identidad de principio a fin.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="26" height="26"><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 9h18" /></svg>
    ),
  },
  {
    variant: 'magenta',
    eyebrow: 'Pagos completos',
    title: 'Yape · Plin · Tarjetas',
    body: 'Visa, Mastercard, transferencia BCP/BBVA/Interbank en checkout único.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="26" height="26"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" /></svg>
    ),
  },
  {
    variant: 'magenta',
    eyebrow: 'QR único por entrada',
    title: 'Antifraude por diseño',
    body: 'Cada ticket lleva un código irrepetible. Imposible duplicar o reutilizar.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="26" height="26"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3" /><path d="M21 14v3" /><path d="M14 21h7" /></svg>
    ),
  },
  {
    variant: 'magenta',
    eyebrow: 'Validación en puerta',
    title: 'App web mobile',
    body: 'Sin descargas, sin configuraciones, sin demoras. Cualquier celular.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="26" height="26"><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" /></svg>
    ),
  },
  {
    variant: 'cyan',
    eyebrow: 'Dashboard en vivo',
    title: 'Cada venta al instante',
    body: 'Métricas, ingresos por canal, composición de público en tiempo real.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="26" height="26"><path d="M3 17l6-6 4 4 7-7" /><path d="M14 8h7v7" /></svg>
    ),
  },
  {
    variant: 'cyan',
    eyebrow: 'Soporte WhatsApp',
    title: 'Línea directa',
    body: 'Con el equipo en horario operativo. Respuesta promedio en minutos.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="26" height="26"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /></svg>
    ),
  },
  {
    variant: 'cyan',
    eyebrow: 'Email automático',
    title: 'QR al comprador',
    body: 'Cada cliente recibe su entrada por email y WhatsApp sin que muevas un dedo.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="26" height="26"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9l9 6 9-6" /></svg>
    ),
  },
  {
    variant: 'cyan',
    eyebrow: 'Exporta todo',
    title: 'CSV o PDF',
    body: 'Reportes financieros y de público listos para descargar cuando los pidas.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="26" height="26"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
    ),
  },
];

export function Features() {
  return (
    <section
      data-screen-label="05 Features"
      className="section-y border-t border-dashed border-border"
    >
      <div className="wrap">
        <header className="mb-20 flex max-w-[920px] flex-col gap-7">
          <Reveal>
            <span className="eyebrow">
              <span className="bracket">[</span> 05 — TODO INCLUIDO{' '}
              <span className="bracket">]</span>
            </span>
          </Reveal>
          <SplitWords words={TITLE} className="h2" />
        </header>

        <Reveal
          variant="reveal-stagger"
          className="grid gap-7 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        >
          {FEATURES.map((f, i) => (
            <Tilt key={i} className="feature relative">
              <div
                className="flex flex-col gap-4 p-7 rounded-lg h-full"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  minHeight: 240,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <span
                  className="pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-300 feature-glow"
                  style={{
                    background:
                      f.variant === 'cyan'
                        ? 'radial-gradient(160px circle at var(--mx,50%) var(--my,50%), rgba(0,229,255,0.12), transparent 60%)'
                        : 'radial-gradient(160px circle at var(--mx,50%) var(--my,50%), rgba(255,31,143,0.12), transparent 60%)',
                  }}
                  aria-hidden="true"
                />
                <span
                  className="w-[26px] h-[26px] relative z-[1]"
                  style={{
                    color:
                      f.variant === 'cyan' ? 'var(--cyan)' : 'var(--magenta)',
                  }}
                >
                  {f.icon}
                </span>
                <span className="mono text-fg-3 relative z-[1]">{f.eyebrow}</span>
                <h3 className="text-[18px] font-medium tracking-[-0.01em] relative z-[1]">
                  {f.title}
                </h3>
                <p className="text-[14px] leading-[1.5] text-fg-2 flex-1 relative z-[1]">
                  {f.body}
                </p>
              </div>
            </Tilt>
          ))}
        </Reveal>

        <style>{`
          .feature:hover .feature-glow { opacity: 1; }
          .feature:hover > div { border-color: var(--border-strong) !important; }
        `}</style>
      </div>
    </section>
  );
}
