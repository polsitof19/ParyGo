// =============================================================
// Post-payment ticket email
// =============================================================
// Called from both Yape approval and the MP webhook after tickets are
// issued. Idempotent via orders.email_sent_at. Edge-runtime safe — uses
// fetch, no Node SDK.
//
// Failures NEVER throw: the caller's payment-confirmation flow must not
// roll back on a flaky Resend response. We log structured and leave
// email_sent_at null so an operator can re-trigger later.
// =============================================================

import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv, publicEnv } from '@/lib/env';
import { formatPEN, formatEventDate, whatsappLink } from '@/lib/utils';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type SendTicketEmailResult =
  | { ok: true; status: 'sent'; resendId: string }
  | { ok: true; status: 'already_sent' }
  | { ok: true; status: 'skipped'; reason: 'no_api_key' | 'no_tickets' | 'no_buyer_email' }
  | { ok: false; status: 'error'; reason: string };

type OrderWithJoins = {
  id: string;
  brand_id: string;
  buyer_name: string;
  buyer_email: string;
  total_cents: number;
  email_sent_at: string | null;
  brand: {
    name: string;
    slug: string;
    whatsapp_e164: string | null;
    contact_email: string | null;
  } | null;
  event: {
    name: string;
    starts_at: string;
    venue_name: string | null;
  } | null;
  tickets: {
    qr_code: string;
    ticket_number: string;
    ticket_type_name: string;
  }[];
};

export async function sendTicketEmail(orderId: string): Promise<SendTicketEmailResult> {
  const apiKey = serverEnv.RESEND_API_KEY;
  const fromEmail = serverEnv.RESEND_FROM_EMAIL ?? 'tickets@parygo.com';
  const supportWhatsapp = publicEnv.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '';

  if (!apiKey) {
    return { ok: true, status: 'skipped', reason: 'no_api_key' };
  }

  const admin = createAdminClient();
  const res = await admin
    .from('orders')
    .select(`
      id, brand_id, buyer_name, buyer_email, total_cents, email_sent_at,
      brand:brands ( name, slug, whatsapp_e164, contact_email ),
      event:events ( name, starts_at, venue_name ),
      tickets ( qr_code, ticket_number, ticket_type_name )
    `)
    .eq('id', orderId)
    .maybeSingle();
  const order = res.data as unknown as OrderWithJoins | null;

  if (!order) {
    return { ok: false, status: 'error', reason: 'order_not_found' };
  }
  if (order.email_sent_at) {
    return { ok: true, status: 'already_sent' };
  }
  if (!order.buyer_email) {
    return { ok: true, status: 'skipped', reason: 'no_buyer_email' };
  }
  if (!order.tickets || order.tickets.length === 0) {
    // Caller invoked us before tickets exist — refuse so a retry after
    // issuance can succeed.
    return { ok: true, status: 'skipped', reason: 'no_tickets' };
  }

  const brand = order.brand;
  const event = order.event;
  const firstQr = order.tickets[0]!.qr_code;
  const subdomain = brand?.slug ? `https://${brand.slug}.parygo.com` : 'https://app.parygo.com';
  const ticketUrl = `${subdomain}/t/${firstQr}`;
  const eventName = event?.name ?? 'tu evento';
  const eventDate = event?.starts_at ? formatEventDate(event.starts_at) : '';
  const venue = event?.venue_name ?? '';
  const brandName = brand?.name ?? 'el promotor';

  const html = renderHtml({
    eventName,
    eventDate,
    venue,
    brandName,
    brandSlug: brand?.slug ?? '',
    buyerName: order.buyer_name,
    total: formatPEN(order.total_cents),
    ticketUrl,
    tickets: order.tickets,
    brandWhatsapp: brand?.whatsapp_e164 ?? null,
    supportWhatsapp,
  });
  const text = renderText({
    eventName,
    eventDate,
    venue,
    brandName,
    buyerName: order.buyer_name,
    total: formatPEN(order.total_cents),
    ticketUrl,
    tickets: order.tickets,
    brandWhatsapp: brand?.whatsapp_e164 ?? null,
  });

  const payload: Record<string, unknown> = {
    from: `${brandName} <${fromEmail}>`,
    to: [order.buyer_email],
    subject: `Tu entrada para ${eventName}`,
    html,
    text,
    tags: [
      { name: 'kind', value: 'ticket_delivery' },
      { name: 'brand', value: brand?.slug ?? 'unknown' },
    ],
  };
  if (brand?.contact_email) {
    payload.reply_to = brand.contact_email;
  }

  let resendId: string | null = null;
  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => '');
      console.error('[sendTicketEmail] resend rejected', {
        order_id: orderId,
        status: resp.status,
        body: bodyText.slice(0, 500),
      });
      return { ok: false, status: 'error', reason: `resend_${resp.status}` };
    }
    const data = (await resp.json().catch(() => null)) as { id?: string } | null;
    resendId = data?.id ?? null;
  } catch (err) {
    console.error('[sendTicketEmail] resend network error', {
      order_id: orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, status: 'error', reason: 'network' };
  }

  // Mark sent. Best-effort — if this update fails the next call will dedupe
  // on the actual Resend logs anyway, but the orders.email_sent_at column
  // is the source of truth for idempotency.
  const { error: updErr } = await admin
    .from('orders')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', orderId);
  if (updErr) {
    console.error('[sendTicketEmail] email_sent_at update failed', {
      order_id: orderId,
      resend_id: resendId,
      error: updErr.message,
    });
  }

  await admin.from('events_log').insert({
    brand_id: order.brand_id,
    order_id: orderId,
    type: 'ticket_email_sent',
    payload: { resend_id: resendId, to: order.buyer_email },
  });

  return { ok: true, status: 'sent', resendId: resendId ?? '' };
}

// -------------------------------------------------------------
// HTML template — inline styles for max email-client compatibility
// -------------------------------------------------------------
function renderHtml(p: {
  eventName: string;
  eventDate: string;
  venue: string;
  brandName: string;
  brandSlug: string;
  buyerName: string;
  total: string;
  ticketUrl: string;
  tickets: { ticket_number: string; ticket_type_name: string; qr_code: string }[];
  brandWhatsapp: string | null;
  supportWhatsapp: string;
}): string {
  const ticketRows = p.tickets
    .map(
      (t) =>
        `<tr><td style="padding:6px 0;font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#444"><strong>${escapeHtml(
          t.ticket_number
        )}</strong> · ${escapeHtml(t.ticket_type_name)}</td></tr>`
    )
    .join('');

  const brandWaButton = p.brandWhatsapp
    ? `<a href="${whatsappLink(
        p.brandWhatsapp.replace(/[^\d]/g, ''),
        `Hola, tengo una consulta con mi entrada para ${p.eventName}`
      )}" style="display:inline-block;padding:10px 18px;border:1px solid #ddd;border-radius:999px;color:#222;text-decoration:none;font:600 13px -apple-system,Segoe UI,Roboto,sans-serif">📱 WhatsApp ${escapeHtml(
        p.brandName
      )}</a>`
    : '';

  const supportLine = p.supportWhatsapp
    ? `<p style="margin:12px 0 0;font:12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#888">¿Problema con tu entrada? Soporte ParyGo: <a href="https://wa.me/${p.supportWhatsapp.replace(
        /[^\d]/g,
        ''
      )}" style="color:#0070f3">WhatsApp</a></p>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(p.eventName)}</title></head>
<body style="margin:0;padding:0;background:#0d0d10">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d10">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
      <tr>
        <td style="padding:32px 32px 8px">
          <p style="margin:0;font:600 11px/1 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.16em;color:#FF1F8F;text-transform:uppercase">[ Compra confirmada ]</p>
          <h1 style="margin:8px 0 0;font:800 30px/1.1 Georgia,serif;color:#111">${escapeHtml(
            p.eventName
          )}</h1>
          <p style="margin:6px 0 0;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#444">${escapeHtml(
            p.eventDate
          )}${p.venue ? ' · ' + escapeHtml(p.venue) : ''}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 32px">
          <p style="margin:0 0 16px;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#222">Hola ${escapeHtml(
            p.buyerName
          )}, tu pago fue aprobado. Esta es tu entrada — guardá este email o el link abajo.</p>
          <a href="${
            p.ticketUrl
          }" style="display:inline-block;padding:14px 24px;background:#FF1F8F;background:linear-gradient(135deg,#FF1F8F,#00E5FF);color:#fff;text-decoration:none;font:700 15px -apple-system,Segoe UI,Roboto,sans-serif;border-radius:999px">Ver mi entrada con QR →</a>
          <p style="margin:10px 0 0;font:12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#666">Tu link permanente: <a href="${
            p.ticketUrl
          }" style="color:#0070f3">${escapeHtml(p.ticketUrl)}</a></p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 24px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;padding-top:16px">
            <tr><td style="font:600 11px/1 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.16em;color:#888;text-transform:uppercase;padding-bottom:8px">[ Resumen ]</td></tr>
            <tr><td style="font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#222"><strong>Total:</strong> ${escapeHtml(
              p.total
            )}</td></tr>
            ${ticketRows}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 32px 28px">
          ${brandWaButton}
          ${supportLine}
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0;font:11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#666;text-align:center">Enviado por ${escapeHtml(
      p.brandName
    )} via ParyGo.</p>
  </td></tr>
</table>
</body></html>`;
}

// -------------------------------------------------------------
// Plaintext fallback
// -------------------------------------------------------------
function renderText(p: {
  eventName: string;
  eventDate: string;
  venue: string;
  brandName: string;
  buyerName: string;
  total: string;
  ticketUrl: string;
  tickets: { ticket_number: string; ticket_type_name: string }[];
  brandWhatsapp: string | null;
}): string {
  const lines = [
    `COMPRA CONFIRMADA — ${p.eventName}`,
    `${p.eventDate}${p.venue ? ' · ' + p.venue : ''}`,
    '',
    `Hola ${p.buyerName}, tu pago fue aprobado.`,
    '',
    `Ver tu entrada con QR:`,
    p.ticketUrl,
    '',
    `Total: ${p.total}`,
    'Entradas:',
    ...p.tickets.map((t) => `  · ${t.ticket_number} (${t.ticket_type_name})`),
  ];
  if (p.brandWhatsapp) {
    lines.push('', `WhatsApp ${p.brandName}: ${p.brandWhatsapp}`);
  }
  lines.push('', `Enviado por ${p.brandName} via ParyGo.`);
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
