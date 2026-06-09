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
import { brandColor, brandInk, contrastOn } from '@/lib/brandColors';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type SendTicketEmailResult =
  | { ok: true; status: 'sent'; resendId: string }
  | { ok: true; status: 'already_sent' }
  | { ok: true; status: 'skipped'; reason: 'no_api_key' | 'no_tickets' | 'no_buyer_email' }
  | { ok: false; status: 'error'; reason: string; detail?: string };

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
    theme_json: { primary_color?: string; logo_url?: string | null } | null;
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
      brand:brands ( name, slug, whatsapp_e164, contact_email, theme_json ),
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
  const subdomain = brand?.slug ? `https://${brand.slug}.parygo.com` : 'https://app.parygo.com';
  // Linkea a la página del PEDIDO (muestra TODOS los QR de la orden, no solo el
  // primero). /t/<uuid> individual sigue existiendo para escaneo en puerta.
  const ticketUrl = `${subdomain}/pedido/${order.id}`;
  const eventName = event?.name ?? 'tu evento';
  const eventDate = event?.starts_at ? formatEventDate(event.starts_at) : '';
  const venue = event?.venue_name ?? '';
  const brandName = brand?.name ?? 'el promotor';

  // Branding de la marca: color principal + logo. Aplicamos el MISMO contraste
  // automático que el sitio público — el email tiene fondo claro, así que:
  //  - `primary` (vivo) va de fondo del botón, con texto `onBrand` legible encima.
  //  - `ink` (brandInk) es la variante oscurecida del color para usarlo como
  //    TEXTO/acento sobre el fondo claro (un #FFEE8C claro se oscurece para leerse).
  const theme = brand?.theme_json ?? {};
  const primary = brandColor(theme.primary_color);
  const onBrand = contrastOn(primary);
  const ink = brandInk(theme.primary_color);
  const logoUrl = theme.logo_url ?? null;

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
    primary,
    onBrand,
    ink,
    logoUrl,
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
      // NEVER log any part of the API key (not even a prefix/length) — edge
      // logs may be visible to operators and the prefix identifies the token.
      console.error('[sendTicketEmail] resend rejected', {
        order_id: orderId,
        status: resp.status,
        body: bodyText.slice(0, 500),
      });
      return {
        ok: false,
        status: 'error',
        reason: `resend_${resp.status}`,
        detail: bodyText.slice(0, 500),
      };
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
  primary: string;
  onBrand: string;
  ink: string;
  logoUrl: string | null;
}): string {
  // Sistema (web-safe, identidad cálida): fondo crema, tinta cálida, sans elegante.
  const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const CREAM = '#FBF7F0';
  const CREAM3 = '#EFE6D6';
  const INK = '#231C17';
  const INK2 = '#6B5F54';
  const INK3 = '#A89B8C';

  const ticketRows = p.tickets
    .map(
      (t) =>
        `<tr><td style="padding:5px 0;font-family:${FONT};font-size:13px;line-height:1.4;color:${INK2}"><strong style="color:${INK}">${escapeHtml(
          t.ticket_number
        )}</strong> &middot; ${escapeHtml(t.ticket_type_name)}</td></tr>`
    )
    .join('');

  // Encabezado de marca: logo si existe; si no, el nombre en tinta.
  const brandHeader = p.logoUrl
    ? `<img src="${escapeHtml(p.logoUrl)}" alt="${escapeHtml(p.brandName)}" height="44" style="display:block;height:44px;width:auto;max-height:44px;border:0;outline:none;text-decoration:none">`
    : `<span style="font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${INK}">${escapeHtml(p.brandName)}</span>`;

  const brandWaButton = p.brandWhatsapp
    ? `<a href="${whatsappLink(
        p.brandWhatsapp.replace(/[^\d]/g, ''),
        `Hola, tengo una consulta con mi entrada para ${p.eventName}`
      )}" style="display:inline-block;padding:11px 20px;background:#ffffff;border:1.5px solid ${CREAM3};border-radius:999px;color:${INK};text-decoration:none;font-family:${FONT};font-weight:600;font-size:13px">WhatsApp ${escapeHtml(
        p.brandName
      )}</a>`
    : '';

  const supportLine = p.supportWhatsapp
    ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${INK3}">&iquest;Problema con tu entrada? Soporte ParyGo: <a href="https://wa.me/${p.supportWhatsapp.replace(
        /[^\d]/g,
        ''
      )}" style="color:${p.ink};font-weight:600;text-decoration:none">WhatsApp</a></p>`
    : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(p.eventName)}</title></head>
<body style="margin:0;padding:0;background:${CREAM};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM}">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${CREAM3};border-radius:20px;overflow:hidden">
      <!-- banda de color de la marca -->
      <tr><td style="height:6px;background:${p.primary};font-size:0;line-height:0">&nbsp;</td></tr>
      <!-- logo de la marca -->
      <tr><td style="padding:26px 32px 0">${brandHeader}</td></tr>
      <!-- cabecera del evento -->
      <tr>
        <td style="padding:18px 32px 0">
          <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1;font-weight:700;letter-spacing:.14em;color:${p.ink};text-transform:uppercase">&#10003; Compra confirmada</p>
          <h1 style="margin:10px 0 0;font-family:${FONT};font-size:27px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:${INK}">${escapeHtml(
            p.eventName
          )}</h1>
          <p style="margin:7px 0 0;font-family:${FONT};font-size:14px;line-height:1.4;color:${INK2}">${escapeHtml(
            p.eventDate
          )}${p.venue ? ' &middot; ' + escapeHtml(p.venue) : ''}</p>
        </td>
      </tr>
      <!-- saludo + botón -->
      <tr>
        <td style="padding:20px 32px 0">
          <p style="margin:0 0 18px;font-family:${FONT};font-size:15px;line-height:1.5;color:${INK}">Hola ${escapeHtml(
            p.buyerName
          )}, tu pago fue aprobado. Esta es tu entrada &mdash; guard&aacute; este email o abr&iacute; tu entrada con el bot&oacute;n.</p>
          <a href="${
            p.ticketUrl
          }" style="display:inline-block;padding:15px 28px;background:${p.primary};color:${p.onBrand};text-decoration:none;font-family:${FONT};font-weight:700;font-size:15px;border-radius:999px">${p.tickets.length > 1 ? 'Ver mis entradas con QR' : 'Ver mi entrada con QR'} &rarr;</a>
          <p style="margin:12px 0 0;font-family:${FONT};font-size:12px;line-height:1.4;color:${INK3}">Tu link permanente: <a href="${
            p.ticketUrl
          }" style="color:${p.ink};text-decoration:none">${escapeHtml(p.ticketUrl)}</a></p>
        </td>
      </tr>
      <!-- resumen -->
      <tr>
        <td style="padding:22px 32px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${CREAM3}">
            <tr><td style="font-family:${FONT};font-size:11px;line-height:1;font-weight:700;letter-spacing:.14em;color:${INK3};text-transform:uppercase;padding:16px 0 8px">Resumen</td></tr>
            <tr><td style="font-family:${FONT};font-size:14px;line-height:1.5;color:${INK};padding-bottom:4px"><strong>Total:</strong> ${escapeHtml(
              p.total
            )}</td></tr>
            ${ticketRows}
          </table>
        </td>
      </tr>
      <!-- contacto de la marca -->
      <tr>
        <td style="padding:20px 32px 30px">
          ${brandWaButton}
          ${supportLine}
        </td>
      </tr>
    </table>
    <!-- pie parygo -->
    <p style="margin:22px 0 0;font-family:${FONT};font-size:11px;line-height:1.4;color:${INK3};text-align:center">Enviado por ${escapeHtml(
      p.brandName
    )} &middot; <span style="color:${INK2};font-weight:700">parygo<span style="color:#FF6A3D">.</span></span></p>
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
