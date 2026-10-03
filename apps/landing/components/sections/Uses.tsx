import { Briefcase, Cake, Disc3, Drama, MicVocal, PartyPopper, Tent } from 'lucide-react';
import type { Dict } from '@/lib/i18n';
import { Resaltado } from '@/components/Resaltado';

// 02 — Para quién. Íconos dibujados (lucide), no emojis: un emoji cambia de
// cara según el teléfono y se lee como relleno. Mismo orden que t.uses.items.
const ICONOS = [Disc3, MicVocal, Tent, PartyPopper, Drama, Cake, Briefcase];

export function Uses({ t }: { t: Dict }) {
  return (
    <section className="section uses" aria-labelledby="uses-title">
      <div className="container">
        <div className="uses__head reveal">
          <h2 className="h2" id="uses-title"><Resaltado r={t.uses.h2} /></h2>
        </div>

        <div className="uses__chips reveal-stagger">
          {t.uses.items.map((txt, i) => {
            const I = ICONOS[i] ?? PartyPopper;
            return <span key={txt} className="use-chip"><I className="use-chip__ico" aria-hidden="true" /> {txt}</span>;
          })}
        </div>

        <p className="uses__note reveal"><Resaltado r={t.uses.note} /></p>
      </div>
    </section>
  );
}
