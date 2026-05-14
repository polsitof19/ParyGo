import { Reveal } from '@/components/animations/Reveal';

export function Garantia() {
  return (
    <section className="bg-bg-cream section-y">
      <div className="wrap">
        <div className="mb-14">
          <Reveal>
            <div className="mono">[ 08 — NUESTRA PROMESA ]</div>
          </Reveal>
        </div>

        <div className="grid items-end gap-12 md:grid-cols-[1.3fr_1fr] md:gap-20">
          <Reveal as="h2" className="text-[56px] leading-none -tracking-[0.04em] sm:text-[72px] md:text-[96px] lg:text-[128px]">
            <span className="serif-i">7 días</span><br />
            o devolución total.
          </Reveal>
          <div>
            <Reveal as="p" delay={0.08} className="mb-8 max-w-[36ch] text-[18px] leading-[1.45] md:text-[22px]">
              Si en los primeros 7 días no quedas conforme con la plataforma,
              te devolvemos el 100% del pack. Sin preguntas, sin trabas, sin
              letras chicas.
            </Reveal>
            <Reveal delay={0.16}>
              <div className="mono inline-flex items-center gap-3.5 normal-case tracking-[0.05em] text-fg-muted">
                <span className="relative inline-flex h-[72px] w-[72px] animate-spin-slow items-center justify-center rounded-full border border-fg">
                  <span className="serif-i animate-spin-reverse-slow text-[24px] text-fg">
                    ↻
                  </span>
                </span>
                <span>
                  <span className="mono normal-case tracking-[0.16em] text-fg-muted">
                    Garantía ParyGo
                  </span>
                  <br />
                  <span className="text-fg">— Devolución completa</span>
                </span>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
