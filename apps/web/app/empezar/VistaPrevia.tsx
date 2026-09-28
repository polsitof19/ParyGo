import { Lock } from 'lucide-react';
import type { Textos } from './textos';

// Vista previa en vivo del enlace (Paul, 2026-09-28: "solo la barra con el
// enlace, sin iPhone"): mientras escribe el nombre o el enlace ve la dirección
// de su página como en la barra del navegador. Texto de React, nunca HTML.
export function VistaPrevia({ slug, t, className = '' }: { slug: string; t: Textos; className?: string }) {
  return (
    <figure className={`ez-vp ${className}`}>
      <figcaption className="ez-vp__cap">{t.w.vista}</figcaption>
      <div className="ez-vp__barra">
        <Lock className="ez-vp__lock" aria-hidden="true" />
        <span className="ez-vp__url"><b>{slug || t.linkPh}</b>.parygo.com</span>
      </div>
    </figure>
  );
}
