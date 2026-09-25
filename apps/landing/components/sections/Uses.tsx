import { Briefcase, Cake, Disc3, Drama, MicVocal, PartyPopper, Tent } from 'lucide-react';

// 02 — Para quién. Íconos dibujados (lucide), no emojis: un emoji cambia de
// cara según el teléfono y se lee como relleno.
const USOS = [
  { t: 'Discotecas y clubes', I: Disc3 },
  { t: 'Conciertos', I: MicVocal },
  { t: 'Festivales', I: Tent },
  { t: 'Fiestas', I: PartyPopper },
  { t: 'Stand-up y teatro', I: Drama },
  { t: 'Cumpleaños', I: Cake },
  { t: 'Eventos de empresa', I: Briefcase },
];

export function Uses() {
  return (
    <section className="section uses" aria-labelledby="uses-title">
      <div className="container">
        <div className="uses__head reveal">
          <h2 className="h2" id="uses-title">
            Si organizas algo, <span className="accent">es para ti</span>.
          </h2>
        </div>

        <div className="uses__chips reveal-stagger">
          {USOS.map(({ t, I }) => (
            <span key={t} className="use-chip"><I className="use-chip__ico" aria-hidden="true" /> {t}</span>
          ))}
        </div>

        <p className="uses__note reveal">
          Con entrada pagada, gratis con registro o solo para invitados: <span className="accent">siempre sabes quién entra</span>.
        </p>
      </div>
    </section>
  );
}
