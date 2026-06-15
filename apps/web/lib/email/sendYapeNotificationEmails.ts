// =============================================================
// Emails de la cola de notificaciones (Grupo C, TANDA 1)
// =============================================================
//   sendYapeRecoveryEmail       → al COMPRADOR: "te falta completar tu Yape".
//   sendYapePendingDigestEmail  → al ORGANIZADOR: "tienes N Yapes por aprobar".
// Reusan el estilo del email de postergación (crema/marca). Best-effort: nunca
// lanzan; devuelven ok/razón. Edge-safe (fetch). NO emiten entradas ni tocan
// dinero ni aprueban Yape: solo avisan/recuerdan.
//
// IDEMPOTENCIA: ambos aceptan idempotencyKey (el dedupe_key de la cola). Resend
// deduplica el mismo Idempotency-Key 24h → un reintento por crash post-envío no
// duplica el email.
// PII: el caller manda UN email por destinatario (to = su propio email); estas
// funciones no conocen ni exponen ninguna lista.
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

export type SendResult = { ok: boolean; reason?: string; resendId?: string | null };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const CREAM = '#FBF7F0', CREAM3 = '#EFE6D6', INK = '#231C17', INK2 = '#6B5F54', INK3 = '#A89B8C';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function appDomain(): string {
  return publicEnv.NEXT_PUBLIC_APP_DOMAIN || 'parygo.com';
}

// Envío genérico a Resend (comparte auth/idempotencia/manejo de error).
async function sendViaResend(args: {
  from: string; to: string; subject: string; html: string; text: string;
  kind: string; brandSlug: string; replyTo?: string | null; idempotencyKey?: string;
}): Promise<SendResult> {
  const apiKey = serverEnv.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_api_key' };
  if (!args.to) return { ok: false, reason: 'no_email' };
  const payload: Record<string, unknown> = {
    from: args.from,
    to: [args.to],
    subject: args.subject,
    html: args.html,
    text: args.text,
    tags: [
      { name: 'kind', value: args.kind },
      { name: 'brand', value: args.brandSlug || 'unknown' },
    ],
  };
  if (args.replyTo) payload.reply_to = args.replyTo;
  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(args.idempotencyKey ? { 'Idempotency-Key': args.idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
    });
    // 409 = Idempotency-Key ya procesada por Resend → el email YA fue aceptado
    // una vez (es justo lo que queremos: no duplicar). Lo tratamos como éxito, no
    // como fallo (si no, reintentaría 5× y moriría en dead-letter sin razón).
    if (resp.status === 409) {
      return { ok: true, resendId: null };
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`[${args.kind}] resend rejected`, { status: resp.status, body: body.slice(0, 300) });
      return { ok: false, reason: `resend_${resp.status}` };
    }
    const data = (await resp.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, resendId: data?.id ?? null };
  } catch (err) {
    console.error(`[${args.kind}] network error`, { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, reason: 'network' };
  }
}

function shell(p: { brand: BrandForEmail; primary: string; ink: string; eyebrow: string; title: string; inner: string; footer: string }): string {
  const brandHeader = p.brand.theme_json?.logo_url
    ? `<img src="${escapeHtml(p.brand.theme_json.logo_url)}" alt="${escapeHtml(p.brand.name)}" height="44" style="display:block;height:44px;width:auto;max-height:44px;border:0;outline:none;text-decoration:none">`
    : `<span style="font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${INK}">${escapeHtml(p.brand.name)}</span>`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(p.title)}</title></head>
<body style="margin:0;padding:0;background:${CREAM};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM}">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${CREAM3};border-radius:20px;overflow:hidden">
      <tr><td style="height:6px;background:${p.primary};font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:26px 32px 0">${brandHeader}</td></tr>
      <tr><td style="padding:18px 32px 0">
        <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1;font-weight:700;letter-spacing:.14em;color:${p.ink};text-transform:uppercase">${escapeHtml(p.eyebrow)}</p>
        <h1 style="margin:10px 0 0;font-family:${FONT};font-size:25px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:${INK}">${escapeHtml(p.title)}</h1>
      </td></tr>
      <tr><td style="padding:18px 32px 0">${p.inner}</td></tr>
      <tr><td style="padding:20px 32px 30px">${p.footer}</td></tr>
    </table>
    <p style="margin:22px 0 0;font-family:${FONT};font-size:11px;line-height:1.4;color:${INK3};text-align:center">Enviado por ${escapeHtml(p.brand.name)} &middot; <span style="color:${INK2};font-weight:700">parygo<span style="color:#FF6A3D">.</span></span></p>
  </td></tr>
</table>
</body></html>`;
}

function ctaButton(href: string, label: string, primary: string, onBrand: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;background:${primary};border-radius:999px;color:${onBrand};text-decoration:none;font-family:${FONT};font-weight:700;font-size:15px">${escapeHtml(label)}</a>`;
}

// -------------------------------------------------------------
// C3 — recordatorio al COMPRADOR de un Yape a medias.
// -------------------------------------------------------------
export async function sendYapeRecoveryEmail(args: {
  to: string;
  buyerName: string;
  eventName: string;
  eventSlug: string;
  brand: BrandForEmail;
  orderId: string;
  idempotencyKey?: string;
}): Promise<SendResult> {
  const fromEmail = serverEnv.RESEND_FROM_EMAIL ?? 'tickets@parygo.com';
  const theme = args.brand.theme_json ?? {};
  const primary = brandColor(theme.primary_color);
  const onBrand = contrastOn(primary);
  const ink = brandInk(theme.primary_color);
  const resumeUrl = `https://${args.brand.slug}.${appDomain()}/${args.eventSlug}/yape?order=${args.orderId}`;
  const waButton = args.brand.whatsapp_e164
    ? `<div style="margin-top:14px">${`<a href="${whatsappLink(args.brand.whatsapp_e164.replace(/[^\d]/g, ''), `Hola, una consulta sobre mi compra de ${args.eventName}`)}" style="display:inline-block;padding:11px 20px;background:#ffffff;border:1.5px solid ${CREAM3};border-radius:999px;color:${INK};text-decoration:none;font-family:${FONT};font-weight:600;font-size:13px">WhatsApp ${escapeHtml(args.brand.name)}</a>`}</div>`
    : '';

  const inner = `
    <p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK}">Hola ${escapeHtml(args.buyerName || '')}, empezaste tu compra para <strong>${escapeHtml(args.eventName)}</strong> pero todavía no la completaste.</p>
    <p style="margin:0 0 18px;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK}">Para recibir tu entrada, subí tu comprobante de Yape. Te toma menos de un minuto:</p>
    <div>${ctaButton(resumeUrl, 'Completar mi compra', primary, onBrand)}</div>
    <p style="margin:16px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.5;color:${INK3}">Si ya pagaste y subiste tu comprobante, ignorá este mensaje.</p>`;

  const html = shell({ brand: args.brand, primary, ink, eyebrow: 'Te falta un paso', title: `Completá tu entrada`, inner, footer: waButton });
  const text = [
    `COMPLETÁ TU ENTRADA — ${args.eventName}`, '',
    `Hola ${args.buyerName || ''}, empezaste tu compra para ${args.eventName} pero no la completaste.`,
    `Subí tu comprobante de Yape acá: ${resumeUrl}`, '',
    'Si ya pagaste y subiste tu comprobante, ignorá este mensaje.',
    args.brand.whatsapp_e164 ? `\nWhatsApp ${args.brand.name}: ${args.brand.whatsapp_e164}` : '',
    `\nEnviado por ${args.brand.name} vía ParyGo.`,
  ].join('\n');

  return sendViaResend({
    from: `${args.brand.name} <${fromEmail}>`,
    to: args.to,
    subject: `Te falta completar tu entrada para ${args.eventName}`,
    html, text, kind: 'yape_recovery', brandSlug: args.brand.slug,
    replyTo: args.brand.contact_email, idempotencyKey: args.idempotencyKey,
  });
}

// -------------------------------------------------------------
// C4 — digest al ORGANIZADOR de Yapes por aprobar.
// -------------------------------------------------------------
export async function sendYapePendingDigestEmail(args: {
  to: string;
  eventName: string;
  eventId: string;
  brand: BrandForEmail;
  pendingCount: number;
  idempotencyKey?: string;
}): Promise<SendResult> {
  const fromEmail = serverEnv.RESEND_FROM_EMAIL ?? 'tickets@parygo.com';
  const theme = args.brand.theme_json ?? {};
  const primary = brandColor(theme.primary_color);
  const onBrand = contrastOn(primary);
  const ink = brandInk(theme.primary_color);
  const reviewUrl = `https://${args.brand.slug}.${appDomain()}/admin/events/${args.eventId}/yape`;
  const n = args.pendingCount;

  const inner = `
    <p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK}">Tenés <strong>${n} comprobante${n === 1 ? '' : 's'} de Yape</strong> esperando tu aprobación en <strong>${escapeHtml(args.eventName)}</strong>.</p>
    <p style="margin:0 0 18px;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK}">Cada comprobante aprobado emite la entrada y manda el QR al comprador.</p>
    <div>${ctaButton(reviewUrl, `Revisar Yapes (${n})`, primary, onBrand)}</div>`;

  const html = shell({ brand: args.brand, primary, ink, eyebrow: 'Pendientes de aprobar', title: `${n} Yape${n === 1 ? '' : 's'} por aprobar`, inner, footer: '' });
  const text = [
    `YAPES POR APROBAR — ${args.eventName}`, '',
    `Tenés ${n} comprobante${n === 1 ? '' : 's'} de Yape esperando tu aprobación.`,
    `Revisalos acá: ${reviewUrl}`, '',
    'Cada comprobante aprobado emite la entrada y manda el QR al comprador.',
    `\nEnviado por ParyGo.`,
  ].join('\n');

  return sendViaResend({
    from: `ParyGo <${fromEmail}>`,
    to: args.to,
    subject: `Tenés ${n} Yape${n === 1 ? '' : 's'} por aprobar en ${args.eventName}`,
    html, text, kind: 'yape_pending_digest', brandSlug: args.brand.slug,
    replyTo: null, idempotencyKey: args.idempotencyKey,
  });
}
