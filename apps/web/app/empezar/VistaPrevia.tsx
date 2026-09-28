import { Lock } from 'lucide-react';
import type { Textos } from './textos';

// Vista previa en vivo del alta paso a paso (Paul, 2026-09-28): mientras
// escribe el nombre y el enlace, ve cómo queda su página. Es un dibujo, no la
// página real: fondo negro como el sitio del comprador y el botón en tinta
// sobre el acento (5.91:1). El nombre y el enlace son texto de React (nunca
// HTML), así que escriba lo que escriba no se inyecta nada.
export function VistaPrevia({ nombre, slug, t, className = '' }: { nombre: string; slug: string; t: Textos; className?: string }) {
  const marca = nombre.trim() || t.w.vpMarca;
  const inicial = Array.from(marca)[0]?.toUpperCase() ?? 'P';
  return (
    <figure className={`ez-vp ${className}`}>
      <figcaption className="ez-vp__cap">{t.w.vista}</figcaption>
      <div className="ez-vp__phone" aria-hidden="true">
        <div className="ez-vp__bar"><Lock className="ez-vp__lock" /><span className="ez-vp__url">{slug || t.linkPh}.parygo.com</span></div>
        <div className="ez-vp__screen">
          <div className="ez-vp__head">
            <span className="ez-vp__logo">{inicial}</span>
            <span className="ez-vp__name">{marca}</span>
            <span className="ez-vp__ofi">{t.w.vpOficial}</span>
          </div>
          <div className="ez-vp__flyer" />
          <p className="ez-vp__meta">{t.w.vpFecha}</p>
          <p className="ez-vp__ev">{t.w.vpEvento}</p>
          <span className="ez-vp__btn">{t.w.vpComprar}</span>
        </div>
      </div>
    </figure>
  );
}
