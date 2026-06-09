// Email del código de promotor (RR.PP.). Edge-safe. La AUTORIZACIÓN la hace el
// caller (la action verifica que el brand_admin sea dueño del código); acá solo
// se carga la data por id y se envía.
import { createAdminClient } from '@/lib/supabase/admin';
import { renderWarmEmail, escapeHtml } from './render';
import { sendViaResend, FROM_EMAIL } from './send';
import type { SendResult } from './send';

function discountText(t: string, v: number): string {
  if (t === 'free') return 'entrada gratis';
  if (t === 'percent') return `${v}% de descuento`;
  return `S/ ${(v / 100).toFixed(2)} de descuento`;
}

export async function sendPromoCodeEmail(codeId: string, toEmail: string): Promise<SendResult> {
  const admin = createAdminClient();
  const { data: code } = await admin
    .from('promo_codes')
    .select('id, code, label, discount_type, discount_value, max_uses, use_count, event:events ( name, slug, brand:brands ( name, slug, contact_email, theme_json ) )')
    .eq('id', codeId)
    .maybeSingle();
  if (!code) return { ok: false, status: 'error', reason: 'code_not_found' };

  const event = Array.isArray(code.event) ? code.event[0] : code.event;
  const brand = event && (Array.isArray(event.brand) ? event.brand[0] : event.brand);
  const theme = (brand?.theme_json ?? {}) as { primary_color?: string; logo_url?: string | null };
  const brandName = brand?.name ?? 'el promotor';
  const eventName = event?.name ?? 'el evento';
  const eventUrl = brand?.slug && event?.slug ? `https://${brand.slug}.parygo.com/${event.slug}` : 'https://parygo.com';
  const usesLeft = code.max_uses == null ? 'usos ilimitados' : `${Math.max(0, code.max_uses - (code.use_count ?? 0))} usos disponibles`;

  const { html } = renderWarmEmail({
    brandName,
    primaryColor: theme.primary_color,
    logoUrl: theme.logo_url,
    eyebrow: 'Código de promotor',
    title: eventName,
    paragraphs: [
      `Sos promotor de <strong>${escapeHtml(brandName)}</strong>. Este es tu código para vender entradas de <strong>${escapeHtml(eventName)}</strong>: lo comparten tus contactos al comprar y aplica <strong>${escapeHtml(discountText(code.discount_type, code.discount_value))}</strong>.`,
      `Tenés ${escapeHtml(usesLeft)}.`,
    ],
    highlight: { label: 'Tu código', value: code.code },
    button: { label: 'Ir al evento →', url: eventUrl },
    footerHtml: `<p style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:12.5px;line-height:1.5;color:#6B5F54">Compartí el link del evento; tus invitados ingresan el código <strong>${escapeHtml(code.code)}</strong> al comprar.</p>`,
  });

  const text = [
    `Tu código de promotor para ${eventName}: ${code.code}`,
    discountText(code.discount_type, code.discount_value),
    usesLeft,
    '',
    `Evento: ${eventUrl}`,
    `Enviado por ${brandName} via ParyGo.`,
  ].join('\n');

  return sendViaResend({
    from: `${brandName} <${FROM_EMAIL()}>`,
    to: [toEmail],
    subject: `Tu código de promotor para ${eventName}`,
    html,
    text,
    replyTo: brand?.contact_email ?? null,
    tags: [{ name: 'kind', value: 'promo_code' }, { name: 'brand', value: brand?.slug ?? 'unknown' }],
  });
}
