import { BatteryFull, Lock, Signal, Wifi } from 'lucide-react';
import type { Textos } from './textos';

// Vista previa en vivo del alta paso a paso (Paul, 2026-09-28): mientras
// escribe el nombre y el enlace, ve cómo queda su página DENTRO DE UN iPHONE
// (marco, Dynamic Island, barra de estado, botones laterales, barra de Safari
// abajo y rayita de inicio). Es un dibujo, no la página real: fondo negro como
// el sitio del comprador y el botón en tinta sobre el acento (5.91:1). El
// nombre y el enlace son texto de React (nunca HTML): no se inyecta nada.
export function VistaPrevia({ nombre, slug, t, className = '' }: { nombre: string; slug: string; t: Textos; className?: string }) {
  const marca = nombre.trim() || t.w.vpMarca;
  const inicial = Array.from(marca)[0]?.toUpperCase() ?? 'P';
  return (
    <figure className={`ez-vp ${className}`}>
      <figcaption className="ez-vp__cap">{t.w.vista}</figcaption>
      <div className="ez-vp__iphone" aria-hidden="true">
        <span className="ez-vp__lat ez-vp__lat--accion" />
        <span className="ez-vp__lat ez-vp__lat--vol1" />
        <span className="ez-vp__lat ez-vp__lat--vol2" />
        <span className="ez-vp__lat ez-vp__lat--power" />
        <div className="ez-vp__pantalla">
          <div className="ez-vp__estado">
            <span className="ez-vp__hora">9:41</span>
            <span className="ez-vp__isla" />
            <span className="ez-vp__iconos"><Signal /><Wifi /><BatteryFull /></span>
          </div>
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
          <div className="ez-vp__safari"><Lock className="ez-vp__lock" /><span className="ez-vp__url">{slug || t.linkPh}.parygo.com</span></div>
          <span className="ez-vp__home" />
        </div>
      </div>
    </figure>
  );
}
