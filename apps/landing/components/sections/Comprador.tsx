import { Mail, RotateCcw, Share2, ShieldCheck, Smartphone, UserX } from 'lucide-react';
import type { Dict } from '@/lib/i18n';
import { Resaltado } from '@/components/Resaltado';

// Lo que vive el público del organizador. Todo existe hoy: compra sin cuenta,
// QR al correo, imagen para guardar/compartir, reenvío desde la página del
// evento, pasarela externa. Íconos en el mismo orden que t.comp.items.
const ICONOS = [UserX, ShieldCheck, Mail, Share2, RotateCcw, Smartphone];

export function Comprador({ t }: { t: Dict }) {
  const c = t.comp;
  return (
    <section className="section comprador" id="publico" aria-labelledby="comp-title">
      <div className="container">
        <div className="section__head reveal">
          <h2 className="h2" id="comp-title"><Resaltado r={c.h2} /></h2>
          <p className="lede">{c.lede}</p>
        </div>
        <ol className="comp__lista reveal-stagger">
          {c.items.map((p, i) => {
            const I = ICONOS[i] ?? Smartphone;
            return (
              <li key={p.t} className="comp__item">
                <I className="comp__ico" aria-hidden="true" />
                <h3 className="comp__t">{p.t}</h3>
                <p className="comp__d">{p.d}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
