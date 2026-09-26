'use client';

import { useState } from 'react';
import { Download, MessageCircle } from 'lucide-react';

// =============================================================
// La ENTRADA como imagen: "Guardar imagen" y "WhatsApp"
// =============================================================
// Se compone la entrada entera en un canvas (QR + evento + cuándo + dónde +
// a nombre de quién), no el QR pelado: lo que queda en la galería tiene que
// servir en la puerta sin señal, y un QR suelto no dice de qué evento es.
//
// Lo que NO lleva, ni en la imagen ni en el texto que se comparte: el código
// de la entrada (TKT-…, ticket_number) ni ninguna URL. El QR ES la entrada.
// El código sigue existiendo en la base y en el panel del organizador, para
// soporte y escaneo. El E2E (paso E) intercepta los fillText del canvas y el
// texto de WhatsApp y falla si aparece un código o un "http".
//
// Se genera en el navegador con `qrcode` importado dinámicamente: no infla el
// bundle inicial ni depende de APIs de Node.

export type DatosEntrada = {
  /** Payload del QR. Solo va DENTRO del QR, nunca como texto. */
  qrCode: string;
  eventName: string;
  ticketTypeName: string;
  attendeeName: string | null;
  whenText: string | null;
  venueName: string | null;
  brandName: string;
};

/** "<evento>-entrada.png", en minúsculas y sin acentos. */
export function nombreArchivo(eventName: string, n?: number): string {
  const base = eventName
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'mi';
  return `${base}-entrada${n ? `-${n}` : ''}.png`;
}

/** El texto que acompaña a la imagen en WhatsApp: evento y fecha. Nada más. */
export function textoCompartir(d: Pick<DatosEntrada, 'eventName' | 'whenText'>): string {
  return `Mi entrada para ${d.eventName}${d.whenText ? ` · ${d.whenText}` : ''}`;
}

function colorDeMarca(): string {
  if (typeof document === 'undefined') return '#FF6A3D';
  const shell = document.querySelector('.client-shell');
  const v = shell ? getComputedStyle(shell).getPropertyValue('--brand').trim() : '';
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#FF6A3D';
}

// Recorta con "…" si el texto no entra en el ancho dado.
function recortar(ctx: CanvasRenderingContext2D, txt: string, max: number): string {
  if (ctx.measureText(txt).width <= max) return txt;
  let t = txt;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export async function componerEntrada(d: DatosEntrada): Promise<Blob> {
  const QRCode = (await import('qrcode')).default;
  const qrUrl: string = await QRCode.toDataURL(d.qrCode, {
    errorCorrectionLevel: 'M', margin: 0, width: 720, color: { dark: '#0A0A0A', light: '#FFFFFF' },
  });
  const qr = new Image();
  await new Promise<void>((res, rej) => {
    qr.onload = () => res();
    qr.onerror = () => rej(new Error('qr'));
    qr.src = qrUrl;
  });

  const W = 1080;
  const H = 1560;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');

  // Mismos tokens que la tarjeta de la pantalla: blanco, tinta #0A0A0A, la
  // franja de 8px (acá 24, a escala) del color de la marca.
  const ink = '#0A0A0A';
  const ink2 = '#525252';
  const ink3 = '#6B6B6B';
  const pad = 88;
  // La familia real de la página: next/font registra Geist con un nombre
  // propio (__GeistSans_…), así que "Geist" a secas no la encontraría.
  const familia = document.querySelector('.client-shell')
    ? getComputedStyle(document.querySelector('.client-shell')!).fontFamily
    : 'system-ui, sans-serif';
  const font = (peso: number, px: number) => `${peso} ${px}px ${familia}`;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = colorDeMarca();
  ctx.fillRect(0, 0, W, 24);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  ctx.font = font(700, 36);
  ctx.textAlign = 'left';
  ctx.fillText(recortar(ctx, d.brandName, W - pad * 2 - 300), pad, 128);
  ctx.fillStyle = ink3;
  ctx.font = font(500, 28);
  ctx.textAlign = 'right';
  ctx.fillText(recortar(ctx, d.ticketTypeName.toUpperCase(), 300), W - pad, 128);

  const qrSize = 720;
  ctx.drawImage(qr, (W - qrSize) / 2, 190, qrSize, qrSize);

  ctx.textAlign = 'center';
  ctx.fillStyle = ink;
  ctx.font = font(700, 44);
  ctx.fillText('Muéstralo en la puerta', W / 2, 1000);

  ctx.strokeStyle = 'rgba(10,10,10,0.14)';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 14]);
  ctx.beginPath();
  ctx.moveTo(0, 1066);
  ctx.lineTo(W, 1066);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = 'left';
  let y = 1160;
  ctx.fillStyle = ink;
  ctx.font = font(800, 60);
  ctx.fillText(recortar(ctx, d.eventName, W - pad * 2), pad, y);
  y += 64;
  ctx.fillStyle = ink2;
  ctx.font = font(400, 34);
  if (d.whenText) { ctx.fillText(recortar(ctx, d.whenText, W - pad * 2), pad, y); y += 50; }
  if (d.venueName) { ctx.fillText(recortar(ctx, d.venueName, W - pad * 2), pad, y); y += 50; }

  y += 26;
  ctx.fillStyle = 'rgba(10,10,10,0.12)';
  ctx.fillRect(pad, y, W - pad * 2, 2);
  y += 70;
  ctx.fillStyle = ink;
  ctx.font = font(600, 36);
  ctx.fillText(recortar(ctx, d.attendeeName || d.brandName, W - pad * 2 - 320), pad, y);
  ctx.fillStyle = ink2;
  ctx.font = font(400, 32);
  ctx.textAlign = 'right';
  ctx.fillText(recortar(ctx, d.ticketTypeName, 300), W - pad, y);

  return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/png'));
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function SaveTicketImage({ datos, n }: { datos: DatosEntrada; n?: number }) {
  const [busy, setBusy] = useState(false);
  async function guardar() {
    setBusy(true);
    try {
      descargar(await componerEntrada(datos), nombreArchivo(datos.eventName, n));
    } catch {
      // Si falla, la página sigue mostrando el QR: se puede escanear o capturar.
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={guardar} disabled={busy} className="c-btn c-btn--white">
      <Download aria-hidden="true" /> {busy ? 'Guardando…' : 'Guardar imagen'}
    </button>
  );
}

// "WhatsApp": comparte la IMAGEN de la entrada. Con Web Share (teléfono), la
// persona elige WhatsApp y el chat; el archivo viaja con un texto de evento y
// fecha. Donde no se pueden compartir archivos (escritorio, navegadores
// viejos), se descarga el PNG y se abre WhatsApp con ese mismo texto, para
// que adjunte la imagen. Antes este botón le mandaba el LINK de la entrada al
// WhatsApp del organizador; el contacto con la marca ya está en el pie.
export function CompartirEntrada({ datos, n }: { datos: DatosEntrada; n?: number }) {
  const [busy, setBusy] = useState(false);
  async function compartir() {
    setBusy(true);
    const texto = textoCompartir(datos);
    try {
      const blob = await componerEntrada(datos);
      const file = new File([blob], nombreArchivo(datos.eventName, n), { type: 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: texto });
        } catch {
          // La persona cerró la hoja de compartir: no es un error.
        }
        return;
      }
      descargar(blob, file.name);
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer');
    } catch {
      // Sin imagen, igual se abre WhatsApp con el texto.
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={compartir} disabled={busy} className="c-btn c-btn--soft">
      <MessageCircle aria-hidden="true" /> {busy ? 'Preparando…' : 'WhatsApp'}
    </button>
  );
}
