'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';

// "Guardar imagen": compone la ENTRADA entera en un canvas (QR + evento +
// cuándo + a nombre de quién + código), no solo el QR pelado. Lo que se guarda
// en la galería tiene que servir en la puerta aunque el teléfono esté sin
// señal, y el QR suelto no dice de qué evento es.
// Se genera en el navegador con `qrcode` importado dinámicamente: no infla el
// bundle inicial ni depende de APIs de Node.
export function SaveTicketImage({
  qrCode,
  fileName,
  eventName,
  ticketTypeName,
  attendeeName,
  whenText,
  brandName,
}: {
  qrCode: string;
  fileName: string;
  eventName: string;
  ticketTypeName: string;
  attendeeName: string | null;
  whenText: string | null;
  brandName: string;
}) {
  const [busy, setBusy] = useState(false);

  async function guardar() {
    setBusy(true);
    try {
      const QRCode = (await import('qrcode')).default;
      const qr = new Image();
      const qrUrl: string = await QRCode.toDataURL(qrCode, {
        errorCorrectionLevel: 'M', margin: 0, width: 760, color: { dark: '#231C17', light: '#FFFFFF' },
      });
      await new Promise<void>((res, rej) => {
        qr.onload = () => res();
        qr.onerror = () => rej(new Error('qr'));
        qr.src = qrUrl;
      });

      const W = 1080;
      const H = 1500;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      const ink = '#231C17';
      const inkSoft = 'rgba(35,28,23,0.66)';
      const pad = 80;

      // Marca arriba
      ctx.fillStyle = inkSoft;
      ctx.font = '600 34px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(recortar(ctx, brandName.toUpperCase(), W - pad * 2 - 260), pad, 104);
      ctx.textAlign = 'right';
      ctx.fillText(recortar(ctx, ticketTypeName.toUpperCase(), 260), W - pad, 104);

      // QR centrado
      const qrSize = 760;
      ctx.drawImage(qr, (W - qrSize) / 2, 170, qrSize, qrSize);

      // Instrucción única
      ctx.textAlign = 'center';
      ctx.fillStyle = ink;
      ctx.font = '800 52px system-ui, sans-serif';
      ctx.fillText('Muéstralo en la puerta', W / 2, 1030);

      // Troquel
      ctx.strokeStyle = 'rgba(35,28,23,0.18)';
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 14]);
      ctx.beginPath();
      ctx.moveTo(pad, 1090);
      ctx.lineTo(W - pad, 1090);
      ctx.stroke();
      ctx.setLineDash([]);

      // Datos
      ctx.textAlign = 'left';
      let y = 1180;
      ctx.fillStyle = ink;
      ctx.font = '800 56px system-ui, sans-serif';
      ctx.fillText(recortar(ctx, attendeeName || eventName, W - pad * 2), pad, y);
      y += 62;
      if (attendeeName) {
        ctx.fillStyle = ink;
        ctx.font = '600 38px system-ui, sans-serif';
        ctx.fillText(recortar(ctx, eventName, W - pad * 2), pad, y);
        y += 54;
      }
      if (whenText) {
        ctx.fillStyle = inkSoft;
        ctx.font = '400 36px system-ui, sans-serif';
        ctx.fillText(recortar(ctx, whenText, W - pad * 2), pad, y);
        y += 54;
      }
      ctx.fillStyle = inkSoft;
      ctx.font = '400 32px system-ui, sans-serif';
      ctx.fillText(fileName, pad, y);

      ctx.textAlign = 'right';
      ctx.fillText('parygo', W - pad, y);

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${fileName.replace(/[^A-Za-z0-9-]/g, '') || 'entrada'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // Si falla, la página sigue mostrando el QR: se puede escanear o capturar.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={guardar} disabled={busy} className="c-btn c-btn--brand">
      <Download className="h-4 w-4" /> {busy ? 'Guardando…' : 'Guardar imagen'}
    </button>
  );
}

// Recorta con "…" si el texto no entra en el ancho dado.
function recortar(ctx: CanvasRenderingContext2D, txt: string, max: number): string {
  if (ctx.measureText(txt).width <= max) return txt;
  let t = txt;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
