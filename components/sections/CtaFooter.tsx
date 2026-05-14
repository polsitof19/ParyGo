import { Reveal } from '@/components/animations/Reveal';
import { CTA } from '@/lib/cta';
import { SITE } from '@/lib/site';

export function CtaFooter() {
  return (
    <div className="dark-scope" id="contacto">
      <section className="wrap pb-[120px] pt-[var(--pad-y)]">
        <Reveal>
          <div className="mono mb-20">[ 10 — INICIEMOS ]</div>
        </Reveal>
        <Reveal as="h2" delay={0.08} className="max-w-[16ch] text-[56px] leading-[0.95] -tracking-[0.04em] sm:text-[72px] md:text-[112px] lg:text-[144px]">
          ¿Listo para que tu evento<br />
          <span className="serif-i">vuele</span>?
        </Reveal>
        <div className="mt-20 flex flex-wrap items-end justify-between gap-10">
          <Reveal>
            <a
              href={CTA.final}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-light"
            >
              Empezar ahora <span className="arrow">→</span>
            </a>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="max-w-[32ch] text-[16px] leading-[1.45] text-fg-dim">
              Respondemos por WhatsApp en menos de 4 horas hábiles. Primera
              llamada de 15 minutos sin compromiso para entender tu evento.
            </p>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border-dark px-[var(--pad-x)] pb-10 pt-20">
        <div className="mx-auto max-w-wrap">
          <div className="grid grid-cols-2 gap-10 pb-20 md:grid-cols-4 md:gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] lg:gap-16">
            <div>
              <h4 className="mono mb-5 font-normal">Studio</h4>
              <p className="max-w-[30ch] text-[14px] leading-[1.55] text-fg-dim">
                Plataforma de ticketing independiente. Pensada para promotores
                de eventos en Perú y LATAM que quieren control real sobre su
                marca y su data.
                <span className="mt-4 block text-fg-dark">
                  <span className="mr-1.5 inline-block h-[6px] w-[6px] -translate-y-[1px] rounded-full bg-accent-green align-middle" />
                  Recibiendo nuevos clientes
                </span>
              </p>
            </div>
            <div>
              <h4 className="mono mb-5 font-normal">Contacto</h4>
              <ul className="flex flex-col gap-3 text-[14px] text-fg-dark">
                <li>
                  <a
                    href={CTA.final}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-u transition-colors hover:text-accent-terra"
                  >
                    WhatsApp ↗
                  </a>
                </li>
                <li>
                  <a
                    href={`https://wa.me/${SITE.whatsappNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-u transition-colors hover:text-accent-terra"
                  >
                    {SITE.whatsappDisplay}
                  </a>
                </li>
                <li>
                  <a href="#contacto" className="link-u transition-colors hover:text-accent-terra">
                    Agenda llamada
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mono mb-5 font-normal">Packs</h4>
              <ul className="flex flex-col gap-3 text-[14px] text-fg-dark">
                <li>
                  <a href={CTA.pack1} target="_blank" rel="noopener noreferrer" className="link-u transition-colors hover:text-accent-terra">
                    Pack 1 · S/200
                  </a>
                </li>
                <li>
                  <a href={CTA.pack3} target="_blank" rel="noopener noreferrer" className="link-u transition-colors hover:text-accent-terra">
                    Pack 3 · S/540
                  </a>
                </li>
                <li>
                  <a href={CTA.pack5} target="_blank" rel="noopener noreferrer" className="link-u transition-colors hover:text-accent-terra">
                    Pack 5 · S/850
                  </a>
                </li>
                <li>
                  <a href={CTA.pack10} target="_blank" rel="noopener noreferrer" className="link-u transition-colors hover:text-accent-terra">
                    Pack 10 · S/1,500
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mono mb-5 font-normal">Plataforma</h4>
              <ul className="flex flex-col gap-3 text-[14px] text-fg-dark">
                <li><a href="#plataforma" className="link-u transition-colors hover:text-accent-terra">Cómo funciona</a></li>
                <li><a href="#casos" className="link-u transition-colors hover:text-accent-terra">Casos de uso</a></li>
                <li><a href="#packs" className="link-u transition-colors hover:text-accent-terra">Precios</a></li>
                <li><a href="#faq" className="link-u transition-colors hover:text-accent-terra">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mono mb-5 font-normal">Legal</h4>
              <ul className="flex flex-col gap-3 text-[14px] text-fg-dark">
                <li><a href="#" className="link-u transition-colors hover:text-accent-terra">Términos</a></li>
                <li><a href="#" className="link-u transition-colors hover:text-accent-terra">Privacidad</a></li>
                <li><a href="#" className="link-u transition-colors hover:text-accent-terra">Garantía</a></li>
              </ul>
            </div>
          </div>

          <div className="my-10 whitespace-nowrap text-[clamp(80px,24vw,320px)] font-normal leading-[0.85] -tracking-[0.06em] text-fg-dark">
            parygo
            <span
              className="ml-[0.04em] inline-block h-[0.14em] w-[0.14em] rounded-full bg-accent-terra align-[0.18em]"
              aria-hidden
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-6 border-t border-border-dark pt-7">
            <span className="mono">© 2026 ParyGo — built with care in lima, pe</span>
            <span className="mono">v1.0 / landing</span>
            <span className="mono">
              <span className="mr-1.5 inline-block h-[6px] w-[6px] -translate-y-[1px] rounded-full bg-accent-green align-middle" />
              recibiendo clientes
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
