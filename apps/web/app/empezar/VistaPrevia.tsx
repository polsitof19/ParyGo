import { BatteryFull, CheckCircle2, Lock, Signal, Wifi, XCircle } from 'lucide-react';
import type { Textos } from './textos';

// Vista previa en vivo del enlace (Paul, 2026-09-28): la PARTE DE ARRIBA de un
// iPhone (marco, Dynamic Island, hora) con la barra de Safari y la dirección
// de su página. Check verde si el enlace está libre; ✕ si está ocupado. Se
// desvanece hacia abajo: da la idea del celular sin ocupar la pantalla.
// Dibujo decorativo (aria-hidden): el estado del enlace lo anuncian los
// textos del formulario. El enlace es texto de React, nunca HTML.
export function VistaPrevia({ slug, libre, t, className = '' }: { slug: string; libre: boolean | null; t: Textos; className?: string }) {
  return (
    <figure className={`ez-vp ${className}`}>
      <figcaption className="ez-vp__cap">{t.w.vista}</figcaption>
      <div className="ez-vp__cel" aria-hidden="true">
        <div className="ez-vp__pantalla">
          <div className="ez-vp__estado">
            <span>9:41</span>
            <span className="ez-vp__isla" />
            <span className="ez-vp__iconos"><Signal /><Wifi /><BatteryFull /></span>
          </div>
          <div className={`ez-vp__barra${libre === false ? ' is-no' : ''}`}>
            <Lock className="ez-vp__lock" />
            <span className="ez-vp__url"><b>{slug || t.linkPh}</b>.parygo.com</span>
            {libre === true && <CheckCircle2 className="ez-vp__estado-ico ez-vp__ok" />}
            {libre === false && <XCircle className="ez-vp__estado-ico ez-vp__no" />}
          </div>
        </div>
      </div>
    </figure>
  );
}
