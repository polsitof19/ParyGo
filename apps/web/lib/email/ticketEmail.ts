// =============================================================
// El EMAIL DE LA ENTRADA — render puro (sin red, sin base)
// =============================================================
// Lo usan sendTicketEmail (compra, cortesía, reenvío) y
// sendTransferredTicketEmail (el nuevo dueño). Pura a propósito: el E2E la
// llama con las entradas reales de demotest y revisa el resultado sin mandar
// un correo.
//
// Mismos tokens que la entrada en pantalla, en versión email: fondo BLANCO,
// tinta #0A0A0A, la franja de 8px del color de la marca, tipografía del
// sistema (Geist no carga en un cliente de correo). Tuteo, sin
// exclamaciones.
//
// Lo que NO lleva, ni en el HTML visible ni en el texto plano:
//   · el código de la entrada (TKT-…/ticket_number) ni el qr_code: el QR ES
//     la entrada, y va como IMAGEN (inline por cid y además adjunto);
//   · ninguna URL escrita. El único link a la entrada es el botón "Ver mi
//     entrada", con texto. Las URLs viven solo en atributos (href del botón,
//     wa.me, src del logo), que no se ven.
// Con esto el email ya no depende del link para abrir la entrada: si el link
// no abre, el QR está en el cuerpo y en el adjunto.

import { brandColor, brandFillPair, brandInk } from '@/lib/brandColors';
import { whatsappLink } from '@/lib/utils';
import { textoPago, contactoHref } from '@/lib/organizador';
import { qrPng, base64 } from '@/lib/qrPng';

/** Cuántos QR van en el CUERPO. El resto, solo adjuntos (Standly: máx. 5 por persona). */
export const QR_INLINE_MAX = 5;

export type EntradaEmail = { ticketTypeName: string; attendeeName: string | null };

export type TicketEmailInput = {
  /** 'compra' | 'transferencia': cambia el titular y el saludo. */
  motivo: 'compra' | 'transferencia';
  buyerName: string;
  eventName: string;
  eventDate: string;
  venue: string;
  brandName: string;
  brandPrimary: string | null | undefined;
  logoUrl: string | null;
  brandWhatsapp: string | null;
  brandEmail: string | null;
  supportWhatsapp: string;
  /** Total ya formateado (solo compra). */
  total: string | null;
  /** Adónde lleva el botón "Ver mi entrada". Solo va en el href. */
  verUrl: string;
  entradas: EntradaEmail[];
};

/** cid del QR de la entrada i (0-based) en el cuerpo. */
export const cidQr = (i: number) => `qr-entrada-${i + 1}`;
/** Nombre del PNG adjunto de la entrada i. */
export const archivoQr = (i: number, total: number) => (total > 1 ? `entrada-${i + 1}.png` : 'entrada.png');

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// Neutros sobre blanco, medidos: #0A0A0A 19.8:1 · #525252 7.8:1 · #6B6B6B 5.3:1.
const INK = '#0A0A0A';
const INK2 = '#525252';
const INK3 = '#6B6B6B';
const LINE = '#E5E5E5';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderTicketEmail(p: TicketEmailInput): { html: string; text: string; subject: string } {
  const primary = brandColor(p.brandPrimary);
  // Botón: el par medido a 4.5:1 con tintas NEUTRAS (blanco o #0A0A0A).
  const par = brandFillPair(p.brandPrimary, 'neutra');
  // El color de marca como TEXTO (el eyebrow): brandInk, AA 4.5:1 contra la
  // superficie más oscura del sistema, así que sobre blanco también.
  const eyebrowColor = brandInk(p.brandPrimary);
  const n = p.entradas.length;
  const inline = Math.min(n, QR_INLINE_MAX);
  const plural = n > 1;
  const transfer = p.motivo === 'transferencia';

  const eyebrow = transfer ? 'Te transfirieron una entrada' : 'Compra confirmada';
  const intro = transfer
    ? `Hola ${escapeHtml(p.buyerName)}, esta entrada ahora es tuya. El QR de abajo es tu entrada: muéstralo en la puerta desde tu teléfono. La entrada anterior quedó anulada.`
    : `Hola ${escapeHtml(p.buyerName)}, tu compra está confirmada. ${plural ? 'Cada QR de abajo es una entrada' : 'El QR de abajo es tu entrada'}: muéstralo en la puerta desde tu teléfono.`;

  const brandHeader = p.logoUrl
    ? `<img src="${escapeHtml(p.logoUrl)}" alt="${escapeHtml(p.brandName)}" height="32" style="display:block;height:32px;width:auto;max-height:32px;border:0;outline:none;text-decoration:none">`
    : `<span style="font-family:${FONT};font-size:18px;font-weight:800;letter-spacing:-0.02em;color:${INK}">${escapeHtml(p.brandName)}</span>`;

  const qrBlocks = p.entradas
    .slice(0, inline)
    .map((e, i) => {
      const quien = [plural ? `Entrada ${i + 1} de ${n}` : null, e.ticketTypeName, e.attendeeName].filter(Boolean).map((x) => escapeHtml(String(x))).join(' &middot; ');
      return `<tr><td align="center" style="padding:${i === 0 ? '8px' : '28px'} 0 0">
          <img src="cid:${cidQr(i)}" alt="QR de tu entrada${plural ? ` ${i + 1}` : ''}" width="216" height="216" style="display:block;width:216px;height:216px;border:0;outline:none">
          <p style="margin:12px 0 0;font-family:${FONT};font-size:13px;line-height:1.4;color:${INK2}">${quien}</p>
        </td></tr>`;
    })
    .join('');
  const resto = n > inline
    ? `<tr><td style="padding:20px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${INK2}">Tus otras ${n - inline} entradas van adjuntas a este correo, una imagen por entrada.</td></tr>`
    : '';

  const boton = `<a href="${escapeHtml(p.verUrl)}" style="display:inline-block;padding:15px 28px;background:${par.fill};color:${par.on};text-decoration:none;font-family:${FONT};font-weight:700;font-size:15px;border-radius:999px">${plural ? 'Ver mis entradas' : 'Ver mi entrada'}</a>`;

  const waMarca = p.brandWhatsapp
    ? `<a href="${escapeHtml(whatsappLink(p.brandWhatsapp.replace(/[^\d]/g, ''), `Hola, tengo una consulta con mi entrada para ${p.eventName}`))}" style="display:inline-block;padding:11px 20px;background:#FFFFFF;border:1px solid ${LINE};border-radius:999px;color:${INK};text-decoration:none;font-family:${FONT};font-weight:600;font-size:13px">WhatsApp de ${escapeHtml(p.brandName)}</a>`
    : '';
  const soporte = p.supportWhatsapp
    ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${INK3}">&iquest;Problema con tu entrada? Soporte ParyGo por <a href="https://wa.me/${p.supportWhatsapp.replace(/[^\d]/g, '')}" style="color:${INK};font-weight:600;text-decoration:underline">WhatsApp</a></p>`
    : '';

  // Quién responde por el evento, al pie. El href va escapado: es un dato de
  // la base dentro de un atributo, en un correo que sale firmado por ParyGo.
  const marcaDelPie = { name: p.brandName, whatsapp_e164: p.brandWhatsapp, contact_email: p.brandEmail };
  const hrefDelPie = contactoHref(marcaDelPie);

  const resumen = p.total
    ? `<tr><td style="padding:24px 32px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE}">
            <tr>
              <td style="padding:14px 0 0;font-family:${FONT};font-size:14px;color:${INK2}">${n === 1 ? '1 entrada' : `${n} entradas`}</td>
              <td align="right" style="padding:14px 0 0;font-family:${FONT};font-size:16px;font-weight:700;color:${INK}">${escapeHtml(p.total)}</td>
            </tr>
          </table>
        </td></tr>`
    : '';

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(p.eventName)}</title></head>
<body style="margin:0;padding:0;background:#FFFFFF;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF">
  <tr><td align="center" style="padding:24px 16px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border:1px solid ${LINE};border-radius:20px;overflow:hidden">
      <tr><td style="height:8px;background:${primary};font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:24px 32px 0">${brandHeader}</td></tr>
      <tr><td style="padding:20px 32px 0">
        <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1;font-weight:600;letter-spacing:.1em;color:${eyebrowColor};text-transform:uppercase">${eyebrow}</p>
        <h1 style="margin:10px 0 0;font-family:${FONT};font-size:28px;line-height:1.05;font-weight:800;letter-spacing:-0.03em;color:${INK}">${escapeHtml(p.eventName)}</h1>
        <p style="margin:8px 0 0;font-family:${FONT};font-size:14px;line-height:1.4;color:${INK2}">${escapeHtml(p.eventDate)}${p.venue ? ' &middot; ' + escapeHtml(p.venue) : ''}</p>
        <p style="margin:18px 0 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${INK}">${intro}</p>
      </td></tr>
      <tr><td style="padding:12px 32px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${qrBlocks}${resto}</table>
      </td></tr>
      <tr><td align="center" style="padding:28px 32px 0">${boton}</td></tr>
      ${resumen}
      <tr><td style="padding:24px 32px 28px">${waMarca}${soporte}</td></tr>
    </table>
    <p style="margin:20px 0 0;max-width:560px;font-family:${FONT};font-size:11px;line-height:1.5;color:${INK3};text-align:center">${escapeHtml(textoPago(marcaDelPie))}${
      hrefDelPie ? ` <a href="${escapeHtml(hrefDelPie)}" style="color:${INK2};text-decoration:underline">Contacto</a>` : '.'
    }</p>
    <p style="margin:8px 0 0;font-family:${FONT};font-size:11px;line-height:1.4;color:${INK3};text-align:center">Enviado por ${escapeHtml(p.brandName)} &middot; <span style="color:${INK2};font-weight:700">parygo<span style="color:#FF6A3D">.</span></span></p>
  </td></tr>
</table>
</body></html>`;

  // Texto plano: sin URL. La entrada está en el QR del correo y en el adjunto.
  const porTipo = new Map<string, number>();
  for (const e of p.entradas) porTipo.set(e.ticketTypeName, (porTipo.get(e.ticketTypeName) ?? 0) + 1);
  const lines = [
    `${eyebrow.toUpperCase()} — ${p.eventName}`,
    `${p.eventDate}${p.venue ? ' · ' + p.venue : ''}`,
    '',
    transfer
      ? `Hola ${p.buyerName}, esta entrada ahora es tuya. La entrada anterior quedó anulada.`
      : `Hola ${p.buyerName}, tu compra está confirmada.`,
    '',
    plural
      ? 'Tus entradas son los QR de este correo; también van adjuntos, una imagen por entrada. Muestra cada QR en la puerta.'
      : 'Tu entrada es el QR de este correo; también va adjunto como imagen. Muéstralo en la puerta.',
    '',
    'Entradas:',
    ...[...porTipo].map(([tipo, q]) => `  · ${q} × ${tipo}`),
  ];
  if (p.total) lines.push(`Total: ${p.total}`);
  if (p.brandWhatsapp) lines.push('', `WhatsApp de ${p.brandName}: ${p.brandWhatsapp}`);
  lines.push('', `${textoPago({ name: p.brandName })}.`);
  lines.push('', `Enviado por ${p.brandName} vía ParyGo.`);

  return { html, text: lines.join('\n'), subject: `Tu entrada para ${p.eventName}` };
}

export type AdjuntoResend = { filename: string; content: string; content_type: 'image/png'; content_id?: string };

/**
 * Los PNG del QR para Resend. Hasta QR_INLINE_MAX van INLINE (content_id →
 * <img src="cid:…"> del cuerpo); TODAS las entradas van además como adjunto
 * con nombre de archivo, para guardarlas o reenviarlas sin abrir nada.
 */
export async function adjuntosEntradas(qrCodes: string[]): Promise<AdjuntoResend[]> {
  const out: AdjuntoResend[] = [];
  const n = qrCodes.length;
  for (let i = 0; i < n; i++) {
    const b64 = base64(await qrPng(qrCodes[i]!));
    if (i < QR_INLINE_MAX) out.push({ filename: `qr-${i + 1}.png`, content: b64, content_type: 'image/png', content_id: cidQr(i) });
    out.push({ filename: archivoQr(i, n), content: b64, content_type: 'image/png' });
  }
  return out;
}

/** Texto VISIBLE de un HTML de email: sin etiquetas, sin atributos, entidades resueltas. */
export function textoVisible(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
