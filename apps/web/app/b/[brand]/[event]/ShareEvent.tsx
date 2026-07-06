'use client';

import { useState } from 'react';
import { toast } from 'sonner';

// =============================================================
// Compartir evento — WhatsApp / Instagram / copiar link
// =============================================================
// Solo front. Usa la URL pública del evento (que ya tiene og:image = cover_url,
// así el link se ve bien al compartir) + un texto listo. Instagram no permite
// pre-cargar un post desde la web, así que copiamos el texto y abrimos la app;
// en mobile, "Compartir" usa el menú nativo (incluye Instagram, Stories, etc.).

export function ShareEvent({ eventName, shareUrl }: { eventName: string; shareUrl: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Voy a ${eventName} 🎟️ Consigue tu entrada aquí:`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copiado');
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error('No se pudo copiar el link');
    }
  }

  async function shareInstagram() {
    // Web Share API (mobile): ofrece Instagram/Stories entre las opciones.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: eventName, text, url: shareUrl });
        return;
      } catch {
        // cancelado o no soportado → caemos al copiado
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${shareUrl}`);
      toast.success('Texto copiado — pégalo en tu historia o post de Instagram');
    } catch {
      toast.error('No se pudo copiar');
    }
    window.open('https://instagram.com', '_blank', 'noopener');
  }

  return (
    <div className="c-sharelinks">
      <span className="c-sharelinks__lead">Compartir —</span>
      <a href={waHref} target="_blank" rel="noopener noreferrer" className="c-textlink c-textlink--muted">WhatsApp</a>
      <span aria-hidden className="c-sharelinks__dot">·</span>
      <button type="button" onClick={shareInstagram} className="c-textlink c-textlink--muted">Instagram</button>
      <span aria-hidden className="c-sharelinks__dot">·</span>
      <button type="button" onClick={copyLink} className="c-textlink c-textlink--muted">{copied ? 'Copiado' : 'Copiar link'}</button>
    </div>
  );
}
