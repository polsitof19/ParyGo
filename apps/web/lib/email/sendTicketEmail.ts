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
import { formatPEN, formatEventDate } from '@/lib/utils';
// La línea de responsabilidad del organizador es la MISMA que la del sitio:
// el texto vive en un solo lugar para que no se desincronicen.
import { renderTicketEmail, adjuntosEntradas } from './ticketEmail';

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
    attendee_name: string | null;
    invalidated_at: string | null;
  }[];
};

// Lee el pedido y ARMA el correo (asunto, HTML, texto, adjuntos) sin mandar
// nada. Separado del envío para que el E2E revise el correo REAL de un
// pedido de demotest —mismo query, mismo render— sin depender de Resend.
export async function armarEmailDePedido(orderId: string, admin = createAdminClient()) {
  // Sin el WhatsApp de soporte de ParyGo (Paul, 2026-09-23); el de la marca se queda.
  const supportWhatsapp = '';
  const res = await admin
    .from('orders')
    .select(`
      id, brand_id, buyer_name, buyer_email, total_cents, email_sent_at,
      brand:brands ( name, slug, whatsapp_e164, contact_email, theme_json ),
      event:events ( name, starts_at, venue_name ),
      tickets ( qr_code, ticket_number, ticket_type_name, attendee_name, invalidated_at )
    `)
    .eq('id', orderId)
    .maybeSingle();
  const order = res.data as unknown as OrderWithJoins | null;
  // Una entrada ANULADA no viaja: su QR ya no entra, y como imagen adjunta
  // sería algo que se puede reenviar o revender como si valiera.
  const vigentes = (order?.tickets ?? []).filter((t) => !t.invalidated_at);
  if (!order || vigentes.length === 0) return { order, correo: null };

  const brand = order.brand;
  const event = order.event;
  const subdomain = brand?.slug ? `https://${brand.slug}.parygo.com` : 'https://app.parygo.com';
  // El botón "Ver mi entrada" lleva a la página del PEDIDO (todos los QR de la
  // orden). La URL va SOLO en el href del botón: el correo no la escribe. La
  // entrada en sí viaja en el cuerpo (QR inline) y como adjunto.
  const verUrl = `${subdomain}/pedido/${order.id}`;
  // Orden estable (el número de entrada); el número NO se muestra.
  const tickets = vigentes.slice().sort((x, y) => x.ticket_number.localeCompare(y.ticket_number));
  const theme = brand?.theme_json ?? {};

  const { html, text, subject } = renderTicketEmail({
    motivo: 'compra',
    buyerName: order.buyer_name,
    eventName: event?.name ?? 'tu evento',
    eventDate: event?.starts_at ? formatEventDate(event.starts_at) : '',
    venue: event?.venue_name ?? '',
    brandName: brand?.name ?? 'el organizador',
    brandPrimary: theme.primary_color,
    logoUrl: theme.logo_url ?? null,
    brandWhatsapp: brand?.whatsapp_e164 ?? null,
    brandEmail: brand?.contact_email ?? null,
    supportWhatsapp,
    total: formatPEN(order.total_cents),
    verUrl,
    entradas: tickets.map((t) => ({ ticketTypeName: t.ticket_type_name, attendeeName: t.attendee_name })),
  });
  const attachments = await adjuntosEntradas(tickets.map((t) => t.qr_code));
  return { order, correo: { html, text, subject, attachments } };
}

export async function sendTicketEmail(orderId: string): Promise<SendTicketEmailResult> {
  const apiKey = serverEnv.RESEND_API_KEY;
  const fromEmail = serverEnv.RESEND_FROM_EMAIL ?? 'tickets@parygo.com';

  if (!apiKey) {
    return { ok: true, status: 'skipped', reason: 'no_api_key' };
  }

  const admin = createAdminClient();
  const { order, correo } = await armarEmailDePedido(orderId, admin);

  if (!order) {
    return { ok: false, status: 'error', reason: 'order_not_found' };
  }
  if (order.email_sent_at) {
    return { ok: true, status: 'already_sent' };
  }
  if (!order.buyer_email) {
    return { ok: true, status: 'skipped', reason: 'no_buyer_email' };
  }
  if (!correo) {
    // Caller invoked us before tickets exist — refuse so a retry after
    // issuance can succeed.
    return { ok: true, status: 'skipped', reason: 'no_tickets' };
  }

  const brand = order.brand;
  const brandName = brand?.name ?? 'el organizador';
  const { html, text, subject, attachments } = correo;

  const payload: Record<string, unknown> = {
    from: `${brandName} <${fromEmail}>`,
    to: [order.buyer_email],
    subject,
    html,
    text,
    attachments,
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
