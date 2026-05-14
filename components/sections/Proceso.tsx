import { Reveal } from '@/components/animations/Reveal';

const steps = [
  {
    n: '01',
    title: 'Configuramos',
    time: '24 horas',
    desc: 'Subes logo, colores y la info del evento. Te entregamos el preview antes de publicar.',
  },
  {
    n: '02',
    title: 'Recibes tu URL',
    time: 'Mismo día',
    desc: 'Tu landing dedicada queda online. Compartes el link, vendes desde el minuto uno.',
  },
  {
    n: '03',
    title: 'Vendes',
    time: 'Hasta el evento',
    desc: 'Pasarela integrada con Yape, Plin, tarjeta. Cada compra genera un QR único enviado al instante.',
  },
  {
    n: '04',
    title: 'Validamos',
    time: 'El día D',
    desc: 'Escáner web en cualquier celular del staff. Aforo en vivo, sin colas, sin entradas duplicadas.',
  },
];

export function Proceso() {
  return (
    <section id="proceso" className="wrap section-y">
      <div className="mb-[120px] grid items-end gap-12 md:grid-cols-2 md:gap-16">
        <Reveal>
          <div className="mono">[ 06 — CÓMO FUNCIONA ]</div>
        </Reveal>
        <div className="md:col-span-2">
          <Reveal as="h2" delay={0.08} className="h-section mt-6">
            De cero a evento<br />
            en cuatro <span className="serif-i">pasos</span>.
          </Reveal>
        </div>
      </div>

      <div className="relative mt-10 grid grid-cols-1 gap-12 sm:grid-cols-2 md:grid-cols-4 md:gap-0">
        <div className="pointer-events-none absolute left-0 right-0 top-[90px] z-0 hidden h-px bg-border md:block" />
        {steps.map((s, i) => (
          <Reveal
            key={s.n}
            delay={i * 0.08}
            className="relative z-[1] md:pr-10"
          >
            <div
              className={`serif-i absolute -top-4 left-0 text-[72px] leading-[0.85] -tracking-[0.04em] md:text-[100px] lg:text-[140px]`}
            >
              {s.n}
            </div>
            <div
              className={`mb-6 mt-[86px] h-[9px] w-[9px] rounded-full ${i === 0 ? 'bg-accent-terra' : 'bg-fg'}`}
            />
            <h3 className="mb-3 text-[22px] leading-none -tracking-[0.02em] md:text-[26px] lg:text-[28px]">
              {s.title}
            </h3>
            <div className="mono mb-4">— {s.time}</div>
            <p className="max-w-[24ch] text-[14px] leading-[1.5] text-fg-muted">
              {s.desc}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
