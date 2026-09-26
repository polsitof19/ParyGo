'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';

// Guarda el QR de Yape del organizador para escanearlo desde la galería en la
// app de Yape (el comprador paga desde el mismo teléfono: no puede apuntarle
// la cámara a su propia pantalla). En el teléfono abre la hoja de compartir
// ("Guardar imagen" en iPhone); en la compu se descarga. El `download` de un
// <a> no sirve acá: la imagen vive en otro origen (Storage) y el navegador lo
// ignora, por eso se baja como blob (Storage responde con CORS *).
export function DownloadQrButton({ url, nombre }: { url: string; nombre: string }) {
  const [busy, setBusy] = useState(false);
  async function guardar() {
    setBusy(true);
    try {
      const blob = await (await fetch(url)).blob();
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      const file = new File([blob], `${nombre}.${ext}`, { type: blob.type || 'image/jpeg' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); } catch { /* cerró la hoja */ }
        return;
      }
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
    } catch {
      // Sin fetch, al menos se abre la imagen: se guarda manteniéndola apretada.
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={guardar} disabled={busy} className="c-btn c-btn--soft">
      <Download className="h-4 w-4" aria-hidden="true" /> {busy ? 'Guardando…' : 'Guardar QR'}
    </button>
  );
}
