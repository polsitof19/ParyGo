import { Reveal } from '@/components/animations/Reveal';
import { EventCardMock } from '@/components/decorative/EventCardMock';

const casos = [
  { id: '01', name: 'Aurora Live', type: 'Concierto', year: '2026', accent: '#E85D3C', variant: 0 as const },
  { id: '02', name: 'Selva Club', type: 'Discoteca', year: '2026', accent: '#0A0A0A', variant: 1 as const },
  { id: '03', name: 'Festival Bruma', type: 'Festival', year: '2026', accent: '#2E5BFF', variant: 2 as const },
  { id: '04', name: 'Mara Sessions', type: 'Privado', year: '2026', accent: '#5C7A4A', variant: 3 as const },
  { id: '05', name: 'Trazo Workshop', type: 'Workshop', year: '2026', accent: '#C49B6C', variant: 4 as const },
  { id: '06', name: 'Núcleo Univ.', type: 'Universitaria', year: '2026', accent: '#7B5CC7', variant: 5 as const },
];

export function CasosUso() {
  return (
    <section className="wrap section-y" id="casos">
      <div className="mb-[120px] grid items-end gap-12 md:grid-cols-2 md:gap-16">
        <Reveal>
          <div className="mono">[ 07 — CASOS DE USO ]</div>
        </Reveal>
        <div className="md:col-span-2">
          <Reveal as="h2" delay={0.08} className="h-section mt-6">
            Eventos que ya<br />
            <span className="serif-i">despegaron</span>.
          </Reveal>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-12 gap-y-16 md:grid-cols-2 md:gap-y-20">
        {casos.map((p, i) => (
          <Reveal key={p.id} delay={(i % 4) * 0.06}>
            <article className="group block cursor-pointer">
              <div className="relative aspect-[4/3] w-full overflow-hidden border border-border bg-bg-cream transition-colors duration-700 group-hover:border-fg">
                <div className="absolute inset-0 flex items-center justify-center transition-transform duration-700 ease-editorial group-hover:scale-[1.02]">
                  <EventCardMock
                    variant={p.variant}
                    name={p.name}
                    accent={p.accent}
                  />
                </div>
              </div>
              <div className="mt-7 grid grid-cols-[1fr_auto] items-end gap-5 transition-transform duration-500 ease-editorial group-hover:translate-x-1.5">
                <div>
                  <div className="mono mb-2">
                    {p.id} / {p.year}
                  </div>
                  <div className="serif-i text-[28px] leading-none -tracking-[0.02em] md:text-[34px] lg:text-[38px]">
                    {p.name}
                  </div>
                </div>
                <div className="mono text-right leading-[1.5]">
                  {p.type}
                  <span className="block text-fg">{p.year}</span>
                </div>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
