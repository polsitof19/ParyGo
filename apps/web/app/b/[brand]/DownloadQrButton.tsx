'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';

// Descarga el QR como PNG. Se genera en el NAVEGADOR (canvas) con el lib `qrcode`
// importado dinámicamente, así no infla el bundle inicial ni depende de APIs
// Node-only (el server edge solo manda el SVG). El payload del QR es el qr_code.
export function DownloadQrButton({ qrCode, fileName, block }: { qrCode: string; fileName: string; block?: boolean }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const QRCode = (await import('qrcode')).default;
      const url: string = await QRCode.toDataURL(qrCode, {
        errorCorrectionLevel: 'M', margin: 1, width: 720, color: { dark: '#0a0a14', light: '#ffffff' },
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName.replace(/[^A-Za-z0-9-]/g, '')}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // si falla, no rompemos la página (el QR sigue visible para escanear / captura)
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={download} disabled={busy} className={`c-btn c-btn--soft${block ? ' c-btn--block' : ''}`}>
      <Download className="h-4 w-4" /> {busy ? 'Generando…' : 'Descargar QR'}
    </button>
  );
}
