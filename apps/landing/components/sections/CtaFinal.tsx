import { Reveal } from '@/components/anim/Reveal';
import { SplitWords, type Word } from '@/components/anim/SplitWords';
import { Magnet } from '@/components/anim/Magnet';
import { CTA } from '@/lib/cta';

const TITLE: Word[] = [
  { t: 'Tu' },
  { t: 'próximo' },
  { t: 'evento' },
  { br: true },
  { t: 'empieza ahora.', italic: true },
];

const STATS = [
  { v: '24H', l: 'Setup completo' },
  { v: '0%', l: 'Comisión por venta' },
  { v: '7 DÍAS', l: 'Garantía' },
  { v: 'WHATSAPP', l: 'Línea directa' },
];

export function CtaFinal() {
  return (
    <section
      id="contacto"
      data-screen-label="10 CTA Final"
      className="relative overflow-hidden border-t border-dashed border-border"
      style={{ paddingTop: 180, paddingBottom: 180 }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 20% 80%, rgba(255,31,143,0.08), transparent 50%), radial-gradient(circle at 80% 20%, rgba(0,229,255,0.06), transparent 50%)',
        }}
        aria-hidden="true"
      />
      <span
        className="absolute"
        style={{
          top: '-10%',
          bottom: '-10%',
          width: 240,
          left: '12%',
          background:
            'linear-gradient(to bottom, transparent, rgba(255,31,143,0.18), transparent)',
          filter: 'blur(8px)',
          transform: 'rotate(18deg)',
        }}
        aria-hidden="true"
      />
      <span
        className="absolute"
        style={{
          top: '-10%',
          bottom: '-10%',
          width: 240,
          left: '64%',
          background:
            'linear-gradient(to bottom, transparent, rgba(0,229,255,0.16), transparent)',
          filter: 'blur(8px)',
          transform: 'rotate(-22deg)',
        }}
        aria-hidden="true"
      />

      <div className="wrap relative z-[1]" style={{ maxWidth: 1100 }}>
        <Reveal>
          <span className="eyebrow">
            <span className="bracket">[</span> 10 — TU PRÓXIMO EVENTO{' '}
            <span className="bracket">]</span>
          </span>
        </Reveal>
        <SplitWords
          words={TITLE}
          className="h2 my-7 max-w-[18ch]"
        />
        <Reveal as="p" className="body-lg max-w-[56ch] mb-12">
          Conversemos por WhatsApp. Respondemos dentro de horario operativo, sin
          formularios eternos ni demos genéricas. Si encajamos, arrancamos.
        </Reveal>
        <Reveal className="flex flex-wrap items-center gap-6">
          <Magnet>
            <a
              href={CTA.final}
              target="_blank"
              rel="noopener noreferrer"
              data-cursor="hover"
              className="btn btn-grad btn-xl"
              style={{ padding: '22px 38px', fontSize: 16 }}
            >
              Abrir WhatsApp <span className="arrow">→</span>
            </a>
          </Magnet>
        </Reveal>
        <Reveal className="mt-8">
          <span className="mono inline-flex items-center gap-2.5 normal-case">
            <span className="pg-dot" />
            Aceptando primeros clientes · Lun-Dom 9am — 11pm
          </span>
        </Reveal>

        <Reveal
          className="mt-20 grid grid-cols-2 gap-6 pt-10 md:grid-cols-4 mono"
          as="div"
        >
          <span style={{ borderTop: '1px solid var(--border)' }} className="hidden" />
          {STATS.map((s) => (
            <div key={s.v} className="stat">
              <span
                className="font-display block mb-1.5"
                style={{
                  fontSize: 'clamp(28px, 3vw, 40px)',
                  letterSpacing: 0,
                  color: 'var(--fg)',
                }}
              >
                {s.v}
              </span>
              <span className="text-fg-3" style={{ letterSpacing: '0.18em' }}>
                {s.l}
              </span>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
