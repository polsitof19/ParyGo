import { Reveal } from '@/components/animations/Reveal';

const items = [
  {
    idx: 'A.01',
    name: 'Comisión',
    big: '10—20%',
    desc: 'Las plataformas grandes se quedan con un porcentaje de cada entrada vendida. Eventos con poco margen se vuelven inviables.',
  },
  {
    idx: 'A.02',
    name: 'Marca',
    big: 'Genérica',
    desc: 'Tu evento aparece dentro del catálogo de un tercero. El comprador recuerda la plataforma, no a ti.',
  },
  {
    idx: 'A.03',
    name: 'Data',
    big: 'Cero',
    desc: 'Nunca ves quién compró, qué le interesa ni cómo volver a contactarlo para el próximo evento.',
  },
];

export function Problemas() {
  return (
    <section className="wrap section-y" id="problemas">
      <div className="mb-[100px] grid items-end gap-12 md:grid-cols-2 md:gap-16">
        <div>
          <Reveal>
            <div className="mono mb-4">[ 03 — PROBLEMAS ]</div>
          </Reveal>
          <Reveal as="h2" delay={0.08} className="text-[40px] leading-none -tracking-[0.035em] sm:text-[48px] md:text-[64px]">
            Tres razones<br />
            por las que <span className="serif-i">duele</span>.
          </Reveal>
        </div>
        <Reveal delay={0.16} as="p" className="lead self-end">
          El ecosistema actual fuerza a elegir entre control, marca o margen.
          Nosotros rechazamos esa premisa.
        </Reveal>
      </div>

      <div className="grid grid-cols-1 border-t border-border md:grid-cols-3">
        {items.map((it, i) => (
          <Reveal
            key={it.idx}
            delay={i * 0.08}
            className="group relative border-b border-border px-0 py-14 transition-colors duration-500 hover:bg-bg-cream md:border-r md:px-10 md:[&:first-child]:pl-0 md:[&:last-child]:border-r-0 md:[&:last-child]:pr-0"
          >
            <div className="mb-16 flex items-baseline justify-between">
              <span className="text-[14px] -tracking-[0.005em]">{it.name}</span>
              <span className="mono">{it.idx}</span>
            </div>
            <span className="serif-i mb-6 block text-[44px] leading-none -tracking-[0.02em] md:text-[64px]">
              {it.big}
            </span>
            <p className="max-w-[26ch] text-[15px] leading-[1.5] text-fg-muted">
              {it.desc}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
