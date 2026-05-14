import { Reveal } from '@/components/animations/Reveal';
import { CTA } from '@/lib/cta';

type Pack = {
  id: string;
  tag: string;
  name: string;
  events: string;
  unit: string;
  price: string;
  desc: string;
  cta: string;
  featured?: boolean;
};

const packs: Pack[] = [
  {
    id: '01',
    tag: 'Tier 01',
    name: 'Pack 1',
    events: '1 evento',
    unit: 'S/200 / evento',
    price: 'S/200',
    desc: 'Para validar la plataforma con un único evento. Todo incluido, sin permanencia.',
    cta: CTA.pack1,
  },
  {
    id: '02',
    tag: 'Tier 02',
    name: 'Pack 3',
    events: '3 eventos',
    unit: 'S/180 / evento',
    price: 'S/540',
    desc: 'Para promotores que producen mensual. 10% off por volumen, válido un año.',
    cta: CTA.pack3,
  },
  {
    id: '03',
    tag: 'Tier 03 / Más elegido',
    name: 'Pack 5',
    events: '5 eventos',
    unit: 'S/170 / evento',
    price: 'S/850',
    desc: 'El equilibrio favorito. Ahorro 15% y soporte priorizado durante cada lanzamiento.',
    cta: CTA.pack5,
    featured: true,
  },
  {
    id: '04',
    tag: 'Tier 04',
    name: 'Pack 10',
    events: '10 eventos',
    unit: 'S/150 / evento',
    price: 'S/1,500',
    desc: 'Para sellos y productoras serias. 25% off, onboarding dedicado y reportes mensuales.',
    cta: CTA.pack10,
  },
];

export function Packs() {
  return (
    <section id="packs" className="wrap section-y">
      <div className="mb-[120px] grid items-end gap-12 md:grid-cols-2 md:gap-16">
        <Reveal>
          <div className="mono">[ 05 — PACKS ]</div>
        </Reveal>
        <div className="md:col-span-2">
          <Reveal as="h2" delay={0.08} className="h-section mt-6">
            Cuatro caminos<br />
            para <span className="serif-i">arrancar</span>.
          </Reveal>
        </div>
      </div>

      <div className="border-t border-border">
        {packs.map((p, i) => (
          <Reveal
            key={p.id}
            delay={i * 0.06}
            className={`group relative grid grid-cols-1 items-center gap-4 border-b border-border px-2 py-10 transition-colors duration-[400ms] md:grid-cols-[0.5fr_1.6fr_0.9fr_0.7fr_0.5fr] md:gap-10 md:px-5 md:py-12 ${
              p.featured ? 'bg-bg-cream hover:bg-bg-cream-deep' : 'hover:bg-bg-cream/55'
            }`}
          >
            <div className="text-[24px] leading-none -tracking-[0.025em] md:text-[30px] lg:text-[34px]">
              <span className="mono mb-3 block">{p.tag}</span>
              {p.name}
            </div>
            <div className="max-w-[34ch] text-[15px] leading-[1.45] text-fg-muted">
              {p.desc}
            </div>
            <div className="text-[22px] leading-none -tracking-[0.02em] tabular-nums md:text-[26px] lg:text-[28px]">
              {p.price}
              <span className="mono mt-2 block normal-case tracking-[0.05em] text-fg-muted">
                {p.unit}
              </span>
            </div>
            <div className="mono">{p.events}</div>
            <a
              href={p.cta}
              target="_blank"
              rel="noopener noreferrer"
              className="link-arrow link-u inline-flex items-center gap-2 justify-self-start text-[14px] md:justify-self-end"
            >
              Contratar <span className="arrow">→</span>
            </a>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <p className="mono mt-12 max-w-[60ch] normal-case tracking-[0.05em] text-fg-muted">
          Todos los packs incluyen URL dedicada, QR único por entrada, escáner
          web y exportable de compradores. IGV incluido. Sin permanencia.
          Comisión sobre venta: 0%.
        </p>
      </Reveal>
    </section>
  );
}
