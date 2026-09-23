// =============================================================
// Entrada TRANSFERIDA — aviso al NUEVO dueño
// =============================================================
// Cuando alguien transfiere/regala su entrada, le mandamos al nuevo dueño SU
// entrada: el QR nuevo en el cuerpo (inline) y como adjunto, más un botón
// "Ver mi entrada" (la URL va solo en el href, no escrita). Es el mismo email
// que el de compra (lib/email/ticketEmail.ts), sin código de entrada ni URL
// visible. Antes enlazaba a /t/<qr> sin QR en el cuerpo; el link es igual de
// portador que el QR, así que llevar el QR no expone nada nuevo y el correo
// deja de depender de que el link abra. Best-effort: nunca lanza.
// =============================================================

import { serverEnv, publicEnv } from '@/lib/env';
import { formatEventDate } from '@/lib/utils';
import { renderTicketEmail, adjuntosEntradas } from './ticketEmail';
import type { BrandForEmail } from './sendEventPostponedEmail';

export type SendTransferResult = { ok: boolean; reason?: string; resendId?: string | null };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendTransferredTicketEmail(args: {
  to: string;
  newName: string;
  eventName: string;
  startsAtIso: string;
  venue: string | null;
  ticketUrl: string;
  /** El qr_code NUEVO: va solo dentro del QR (inline y adjunto). */
  qrCode: string;
  ticketTypeName: string;
  brand: BrandForEmail;
}): Promise<SendTransferResult> {
  const apiKey = serverEnv.RESEND_API_KEY;
  const fromEmail = serverEnv.RESEND_FROM_EMAIL ?? 'tickets@parygo.com';
  if (!apiKey) return { ok: false, reason: 'no_api_key' };
  if (!args.to) return { ok: false, reason: 'no_email' };

  const theme = args.brand.theme_json ?? {};
  const { html, text, subject } = renderTicketEmail({
    motivo: 'transferencia',
    buyerName: args.newName,
    eventName: args.eventName,
    eventDate: args.startsAtIso ? formatEventDate(args.startsAtIso) : '',
    venue: args.venue ?? '',
    brandName: args.brand.name,
    brandPrimary: theme.primary_color,
    logoUrl: theme.logo_url ?? null,
    brandWhatsapp: args.brand.whatsapp_e164,
    brandEmail: args.brand.contact_email,
    supportWhatsapp: publicEnv.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '',
    total: null,
    verUrl: args.ticketUrl,
    entradas: [{ ticketTypeName: args.ticketTypeName, attendeeName: args.newName }],
  });
  const attachments = await adjuntosEntradas([args.qrCode]);

  const payload: Record<string, unknown> = {
    from: `${args.brand.name} <${fromEmail}>`,
    to: [args.to],
    subject,
    html,
    text,
    attachments,
    tags: [
      { name: 'kind', value: 'ticket_transferred' },
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
      console.error('[sendTransferredTicketEmail] resend rejected', { status: resp.status, body: body.slice(0, 300) });
      return { ok: false, reason: `resend_${resp.status}` };
    }
    const data = (await resp.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, resendId: data?.id ?? null };
  } catch (err) {
    console.error('[sendTransferredTicketEmail] network error', { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, reason: 'network' };
  }
}
