'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Share2, Link2, Check, Instagram } from 'lucide-react';

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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
      <a href={waHref} target="_blank" rel="noopener noreferrer" className="c-btn c-btn--soft" style={{ height: 38, padding: '0 14px', fontSize: 13.5 }}>
        <Share2 className="h-4 w-4" /> WhatsApp
      </a>
      <button type="button" onClick={shareInstagram} className="c-btn c-btn--soft" style={{ height: 38, padding: '0 14px', fontSize: 13.5 }}>
        <Instagram className="h-4 w-4" /> Instagram
      </button>
      <button type="button" onClick={copyLink} className="c-btn c-btn--soft" style={{ height: 38, padding: '0 14px', fontSize: 13.5 }}>
        {copied ? <><Check className="h-4 w-4" /> Copiado</> : <><Link2 className="h-4 w-4" /> Copiar link</>}
      </button>
    </div>
  );
}
