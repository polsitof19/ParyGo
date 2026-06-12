// =============================================================
// Aviso de POSTERGACIÓN de evento (cambio de fecha)
// =============================================================
// Se envía a cada comprador con entradas válidas cuando el organizador posterga
// un evento. NO reenvía el QR ni toca los tickets — solo avisa la nueva fecha:
// "Tu entrada sigue válida". Tematizado con logo + color de la marca (igual que
// el email del ticket). Best-effort: nunca lanza; devuelve ok/razón por
// destinatario para que el caller cuente cuántos se enviaron. Edge-safe (fetch).
// PII: el caller manda UN email por comprador (to = su propio email); esta
// función no conoce ni expone la lista de compradores.
// =============================================================

import { serverEnv, publicEnv } from '@/lib/env';
import { brandColor, brandInk, contrastOn } from '@/lib/brandColors';
import { whatsappLink } from '@/lib/utils';

export type BrandForEmail = {
  name: string;
  slug: string;
  whatsapp_e164: string | null;
  contact_email: string | null;
  theme_json: { primary_color?: string; logo_url?: string | null } | null;
};

export type SendPostponedResult = { ok: boolean; reason?: string };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendEventPostponedEmail(args: {
  to: string;
  buyerName: string;
  eventName: string;
  newDateLabel: string; // ya formateada en hora de Lima
  oldDateLabel: string;
  venue: string | null;
  brand: BrandForEmail;
}): Promise<SendPostponedResult> {
  const apiKey = serverEnv.RESEND_API_KEY;
  const fromEmail = serverEnv.RESEND_FROM_EMAIL ?? 'tickets@parygo.com';
  if (!apiKey) return { ok: false, reason: 'no_api_key' };
  if (!args.to) return { ok: false, reason: 'no_email' };

  const theme = args.brand.theme_json ?? {};
  const primary = brandColor(theme.primary_color);
  const onBrand = contrastOn(primary);
  const ink = brandInk(theme.primary_color);
  const logoUrl = theme.logo_url ?? null;
  const supportWhatsapp = publicEnv.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '';

  const html = renderHtml({ ...args, primary, onBrand, ink, logoUrl, supportWhatsapp });
  const text = renderText(args);

  const payload: Record<string, unknown> = {
    from: `${args.brand.name} <${fromEmail}>`,
    to: [args.to],
    subject: `Cambio de fecha: ${args.eventName}`,
    html,
    text,
    tags: [
      { name: 'kind', value: 'event_postponed' },
      { name: 'brand', value: args.brand.slug || 'unknown' },
    ],
  };
  if (args.brand.contact_email) payload.reply_to = args.brand.contact_email;

  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error('[sendEventPostponedEmail] resend rejected', { status: resp.status, body: body.slice(0, 300) });
      return { ok: false, reason: `resend_${resp.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[sendEventPostponedEmail] network error', { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, reason: 'network' };
  }
}

function renderHtml(p: {
  buyerName: string; eventName: string; newDateLabel: string; oldDateLabel: string;
  venue: string | null; brand: BrandForEmail;
  primary: string; onBrand: string; ink: string; logoUrl: string | null; supportWhatsapp: string;
}): string {
  const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const CREAM = '#FBF7F0', CREAM3 = '#EFE6D6', INK = '#231C17', INK2 = '#6B5F54', INK3 = '#A89B8C';
  const brandName = p.brand.name;
  const brandHeader = p.logoUrl
    ? `<img src="${escapeHtml(p.logoUrl)}" alt="${escapeHtml(brandName)}" height="44" style="display:block;height:44px;width:auto;max-height:44px;border:0;outline:none;text-decoration:none">`
    : `<span style="font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${INK}">${escapeHtml(brandName)}</span>`;
  const brandWaButton = p.brand.whatsapp_e164
    ? `<a href="${whatsappLink(p.brand.whatsapp_e164.replace(/[^\d]/g, ''), `Hola, una consulta sobre el cambio de fecha de ${p.eventName}`)}" style="display:inline-block;padding:11px 20px;background:#ffffff;border:1.5px solid ${CREAM3};border-radius:999px;color:${INK};text-decoration:none;font-family:${FONT};font-weight:600;font-size:13px">WhatsApp ${escapeHtml(brandName)}</a>`
    : '';
  const supportLine = p.supportWhatsapp
    ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${INK3}">&iquest;Dudas? Soporte ParyGo: <a href="https://wa.me/${p.supportWhatsapp.replace(/[^\d]/g, '')}" style="color:${p.ink};font-weight:600;text-decoration:none">WhatsApp</a></p>`
    : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(p.eventName)}</title></head>
<body style="margin:0;padding:0;background:${CREAM};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM}">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${CREAM3};border-radius:20px;overflow:hidden">
      <tr><td style="height:6px;background:${p.primary};font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:26px 32px 0">${brandHeader}</td></tr>
      <tr><td style="padding:18px 32px 0">
        <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1;font-weight:700;letter-spacing:.14em;color:${p.ink};text-transform:uppercase">Cambio de fecha</p>
        <h1 style="margin:10px 0 0;font-family:${FONT};font-size:27px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:${INK}">${escapeHtml(p.eventName)}</h1>
      </td></tr>
      <tr><td style="padding:18px 32px 0">
        <p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK}">Hola ${escapeHtml(p.buyerName || '')}, el evento <strong>${escapeHtml(p.eventName)}</strong> se movi&oacute; de fecha.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${CREAM3};border-radius:14px;background:${CREAM}">
          <tr><td style="padding:16px 18px">
            <p style="margin:0;font-family:${FONT};font-size:12px;color:${INK3};text-decoration:line-through">${escapeHtml(p.oldDateLabel)}</p>
            <p style="margin:6px 0 0;font-family:${FONT};font-size:18px;font-weight:800;color:${p.ink}">&rarr; ${escapeHtml(p.newDateLabel)}</p>
            ${p.venue ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:13px;color:${INK2}">${escapeHtml(p.venue)}</p>` : ''}
          </td></tr>
        </table>
        <p style="margin:16px 0 0;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK}"><strong>Tu entrada sigue v&aacute;lida.</strong> No tienes que hacer nada: us&aacute; el mismo QR que ya recibiste.</p>
      </td></tr>
      <tr><td style="padding:20px 32px 30px">${brandWaButton}${supportLine}</td></tr>
    </table>
    <p style="margin:22px 0 0;font-family:${FONT};font-size:11px;line-height:1.4;color:${INK3};text-align:center">Enviado por ${escapeHtml(brandName)} &middot; <span style="color:${INK2};font-weight:700">parygo<span style="color:#FF6A3D">.</span></span></p>
  </td></tr>
</table>
</body></html>`;
}

function renderText(p: { buyerName: string; eventName: string; newDateLabel: string; oldDateLabel: string; venue: string | null; brand: BrandForEmail }): string {
  const lines = [
    `CAMBIO DE FECHA — ${p.eventName}`,
    '',
    `Hola ${p.buyerName || ''}, el evento ${p.eventName} se movió de fecha.`,
    `Antes: ${p.oldDateLabel}`,
    `Ahora: ${p.newDateLabel}${p.venue ? ' · ' + p.venue : ''}`,
    '',
    'Tu entrada sigue válida. No tienes que hacer nada: usa el mismo QR que ya recibiste.',
  ];
  if (p.brand.whatsapp_e164) lines.push('', `WhatsApp ${p.brand.name}: ${p.brand.whatsapp_e164}`);
  lines.push('', `Enviado por ${p.brand.name} vía ParyGo.`);
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
