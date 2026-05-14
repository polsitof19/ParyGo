import { Reveal } from '@/components/animations/Reveal';

const pillars = [
  {
    n: '01',
    title: 'marca',
    full: 'Tu marca',
    italic: 'marca',
    desc: 'URL dedicada, paleta propia, copy a medida. El comprador entra a tu mundo, no al de otra plataforma.',
  },
  {
    n: '02',
    title: 'QR único',
    full: 'QR único',
    italic: 'QR único',
    desc: 'Cada entrada genera un código irrepetible. Imposible duplicar, imposible revender sin trazar. Validación instantánea desde cualquier teléfono.',
  },
  {
    n: '03',
    title: 'sin comisión',
    full: 'Sin comisión',
    italic: 'comisión',
    desc: 'Pagas un plan fijo por evento. Lo que vendes se queda contigo. Pasarela transparente, sin sorpresas, sin letras chicas.',
  },
];

export function Solucion() {
  return (
    <section id="plataforma" className="wrap section-y">
      <div className="mb-[120px] grid items-end gap-12 md:grid-cols-2 md:gap-16">
        <Reveal>
          <div className="mono">[ 04 — POR QUÉ PARYGO ]</div>
        </Reveal>
        <div className="md:col-span-2">
          <Reveal as="h2" delay={0.08} className="h-section mt-6">
            Tres principios,<br />
            cero <span className="serif-i">trabas</span>.
          </Reveal>
        </div>
      </div>

      <div className="flex flex-col border-t border-border">
        {pillars.map((p, i) => (
          <Reveal
            key={p.n}
            delay={i * 0.08}
            className="grid grid-cols-1 items-start gap-6 border-b border-border py-12 md:grid-cols-[0.6fr_1.2fr_1fr] md:gap-16 md:py-20"
          >
            <div className="serif-i leading-[0.85] -tracking-[0.04em] text-[80px] md:text-[120px] lg:text-[180px]">
              {p.n}
            </div>
            <h3 className="text-[34px] -tracking-[0.035em] leading-none md:text-[44px] lg:text-[56px]">
              Más <span className="serif-i">{p.italic}</span>.
            </h3>
            <p className="max-w-[36ch] text-[18px] leading-[1.5] text-fg-muted md:self-end">
              {p.desc}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
