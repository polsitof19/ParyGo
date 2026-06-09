// Aviso al comprador cuando su comprobante Yape es RECHAZADO. Edge-safe. La
// autorización la hace el caller (rejectYapeProof ya verificó brand_admin).
import { createAdminClient } from '@/lib/supabase/admin';
import { renderWarmEmail, escapeHtml } from './render';
import { sendViaResend, FROM_EMAIL } from './send';
import type { SendResult } from './send';

export async function sendYapeRejectedEmail(orderId: string, reason: string | null): Promise<SendResult> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, buyer_name, buyer_email, event:events ( name, slug ), brand:brands ( name, slug, whatsapp_e164, contact_email, theme_json )')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || !order.buyer_email) return { ok: false, status: 'error', reason: 'order_or_email_missing' };

  const event = Array.isArray(order.event) ? order.event[0] : order.event;
  const brand = Array.isArray(order.brand) ? order.brand[0] : order.brand;
  const theme = (brand?.theme_json ?? {}) as { primary_color?: string; logo_url?: string | null };
  const brandName = brand?.name ?? 'el promotor';
  const eventName = event?.name ?? 'tu evento';
  const eventUrl = brand?.slug && event?.slug ? `https://${brand.slug}.parygo.com/${event.slug}` : 'https://parygo.com';
  const wa = brand?.whatsapp_e164 ? brand.whatsapp_e164.replace(/[^\d]/g, '') : null;

  const paragraphs = [
    `Hola ${escapeHtml(order.buyer_name ?? '')}, revisamos tu comprobante de Yape para <strong>${escapeHtml(eventName)}</strong> y no pudimos aprobarlo.`,
  ];
  if (reason) paragraphs.push(`Motivo: <strong>${escapeHtml(reason)}</strong>.`);
  paragraphs.push('No se generó ningún cargo de nuestra parte. Podés intentar la compra de nuevo o escribirnos si creés que fue un error.');

  const { html } = renderWarmEmail({
    brandName,
    primaryColor: theme.primary_color,
    logoUrl: theme.logo_url,
    eyebrow: 'Pago no aprobado',
    tone: 'alert',
    title: eventName,
    paragraphs,
    button: { label: 'Volver a intentar →', url: eventUrl },
    footerHtml: wa
      ? `<p style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:12.5px;line-height:1.5;color:#6B5F54">¿Dudas? <a href="https://wa.me/${wa}" style="color:#6B5F54;font-weight:600">WhatsApp ${escapeHtml(brandName)}</a></p>`
      : null,
  });

  const text = [
    `Pago no aprobado — ${eventName}`,
    `Hola ${order.buyer_name ?? ''}, no pudimos aprobar tu comprobante de Yape.`,
    reason ? `Motivo: ${reason}` : '',
    `Podés intentar de nuevo: ${eventUrl}`,
    `Enviado por ${brandName} via ParyGo.`,
  ].filter(Boolean).join('\n');

  return sendViaResend({
    from: `${brandName} <${FROM_EMAIL()}>`,
    to: [order.buyer_email],
    subject: `Tu pago de Yape para ${eventName} no fue aprobado`,
    html,
    text,
    replyTo: brand?.contact_email ?? null,
    tags: [{ name: 'kind', value: 'yape_rejected' }, { name: 'brand', value: brand?.slug ?? 'unknown' }],
  });
}
