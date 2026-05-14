import { Reveal } from '@/components/animations/Reveal';

export function Manifiesto() {
  return (
    <section id="manifiesto" className="wrap section-y">
      <div className="mb-[120px] grid items-end gap-12 md:grid-cols-2 md:gap-16">
        <Reveal>
          <div className="mono self-start">[ 02 — MANIFIESTO ]</div>
        </Reveal>
        <div className="md:col-span-2">
          <Reveal as="h2" delay={0.08} className="h-section mt-6">
            El ticketing en Latam<br />
            está <span className="serif-i">roto</span>.
          </Reveal>
        </div>
      </div>

      <div className="ml-auto grid max-w-[1180px] grid-cols-1 gap-8 md:grid-cols-2 md:gap-24">
        <Reveal as="p" className="text-[20px] leading-[1.4] tracking-[-0.015em] text-fg md:text-[26px]">
          Las plataformas grandes cobran 10–20% por entrada. Los promotores
          quedan atados a marcas ajenas, sin datos de sus compradores y sin
          control real sobre el flujo.
        </Reveal>
        <Reveal as="p" delay={0.08} className="text-[20px] leading-[1.4] tracking-[-0.015em] text-fg-muted md:text-[26px]">
          ParyGo existe para arreglarlo. Tu marca, tu URL, tu data, tus reglas.
          Un plan fijo por evento — todo lo recaudado es tuyo.
        </Reveal>
      </div>
    </section>
  );
}
