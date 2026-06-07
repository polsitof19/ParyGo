'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv, publicEnv } from '@/lib/env';
import { createMercadoPagoPreference } from '@/lib/mercadopago';
import { issueTicketsForOrder, markOrderPaid } from '@/lib/tickets';
import { sendTicketEmail } from '@/lib/email/sendTicketEmail';

export type CheckoutInput = {
  eventId: string;
  brandId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  ageOk: boolean;
  marketingOptIn: boolean;
  method: 'yape_manual' | 'mercadopago';
  items: { ticketTypeId: string; quantity: number }[];
  sessionId: string;
  promoCode?: string;
};

const PROMO_ERRORS: Record<string, string> = {
  PROMO_NOT_FOUND: 'Código promocional inválido.',
  PROMO_EXPIRED: 'Ese código ya venció.',
  PROMO_EXHAUSTED: 'Ese código ya alcanzó su límite de usos.',
  PROMO_EMAIL_LIMIT: 'Ya usaste ese código con este email.',
  PROMO_NOT_APPLICABLE: 'El código no aplica a las entradas elegidas.',
};
function mapPromoError(msg: string): string {
  for (const key of Object.keys(PROMO_ERRORS)) if (msg.includes(key)) return PROMO_ERRORS[key]!;
  return 'No se pudo aplicar el código.';
}

export type CheckoutResult =
  | { ok: true; redirectUrl: string }
  // MercadoPago: instead of an immediate redirect, the client renders the MP
  // Wallet Brick (MP.js + public_key) bound to this server-created preference.
  | { ok: true; mp: { preferenceId: string; initPoint: string } }
  | { ok: false; message: string };

const schema = z.object({
  eventId: z.string().uuid(),
  brandId: z.string().uuid(),
  buyerName: z.string().min(2).max(120),
  buyerEmail: z.string().email(),
  buyerPhone: z.string().min(7).max(20),
  ageOk: z.literal(true),
  marketingOptIn: z.boolean(),
  method: z.enum(['yape_manual', 'mercadopago']),
  items: z
    .array(
      z.object({
        ticketTypeId: z.string().uuid(),
        quantity: z.number().int().min(1).max(10),
      })
    )
    .min(1),
  sessionId: z.string().min(8).max(64),
  promoCode: z.string().min(2).max(32).optional().or(z.literal('')),
});

export async function startCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors[0]?.message ?? 'Datos inválidos' };
  }

  const admin = createAdminClient();
  const reqHeaders = headers();
  // For absolute URLs (MP back_urls / webhook), trust x-forwarded-host first
  // because the CF Worker proxy rewrites `host` to the canonical Pages host
  // (parygo-app.pages.dev). The middleware uses the same precedence.
  // For in-app redirects we prefer relative paths — they survive any future
  // proxy reconfiguration and are the canonical pattern used elsewhere.
  const forwardedHost = reqHeaders.get('x-forwarded-host');
  const rawHost = reqHeaders.get('host') ?? '';
  const host = forwardedHost || rawHost;
  const proto = reqHeaders.get('x-forwarded-proto') ?? 'https';

  // 1. Verify event + ticket types in one query (server-trusted).
  const { data: event } = await admin
    .from('events')
    .select('id, slug, name, brand_id, is_published, min_age')
    .eq('id', parsed.data.eventId)
    .maybeSingle();
  if (!event || !event.is_published) {
    return { ok: false, message: 'Evento no disponible.' };
  }
  if (event.brand_id !== parsed.data.brandId) {
    return { ok: false, message: 'Marca/evento no coinciden.' };
  }

  const ticketTypeIds = parsed.data.items.map((i) => i.ticketTypeId);
  const { data: tts } = await admin
    .from('ticket_types')
    .select('id, name, price_cents, capacity, sold, is_active, is_unlimited, event_id')
    .in('id', ticketTypeIds);
  if (!tts || tts.length !== ticketTypeIds.length) {
    return { ok: false, message: 'Tipo de entrada inválido.' };
  }

  // Resolve the ACTIVE price phase server-side (single source of truth). The
  // client-sent price is never trusted; we charge the phase active right now.
  // Falls back to ticket_types.price_cents for types without phases.
  const { data: activePrices } = await admin.rpc('get_event_active_prices', {
    p_event_id: event.id,
  });
  const activePriceByType = new Map(
    (activePrices ?? []).map((r) => [r.ticket_type_id, r.active_price_cents])
  );

  // 2. Validate stock + compute total server-side.
  let totalCents = 0;
  type Resolved = {
    id: string;
    name: string;
    price_cents: number;
    quantity: number;
  };
  const resolved: Resolved[] = [];
  for (const item of parsed.data.items) {
    const tt = tts.find((t) => t.id === item.ticketTypeId);
    if (!tt || !tt.is_active || tt.event_id !== event.id) {
      return { ok: false, message: 'Tipo de entrada no disponible.' };
    }
    // Unlimited types never block on stock; limited types keep anti-oversell.
    if (!tt.is_unlimited) {
      const remaining = tt.capacity - tt.sold;
      if (remaining < item.quantity) {
        return {
          ok: false,
          message: `Stock insuficiente para ${tt.name}. Quedan ${remaining}.`,
        };
      }
    }
    // Active-phase price (fallback to base price_cents if no phase rows).
    const unitPrice = activePriceByType.get(tt.id) ?? tt.price_cents;
    totalCents += unitPrice * item.quantity;
    resolved.push({
      id: tt.id,
      name: tt.name,
      price_cents: unitPrice,
      quantity: item.quantity,
    });
  }

  if (totalCents <= 0) {
    return { ok: false, message: 'Total inválido.' };
  }

  // 3. Capture UTM + IP for attribution.
  const ip = reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = reqHeaders.get('user-agent') ?? null;
  const referer = reqHeaders.get('referer') ?? '';
  const referUrl = (() => {
    try {
      return new URL(referer);
    } catch {
      return null;
    }
  })();
  const utm = referUrl
    ? {
        source: referUrl.searchParams.get('utm_source'),
        medium: referUrl.searchParams.get('utm_medium'),
        campaign: referUrl.searchParams.get('utm_campaign'),
        content: referUrl.searchParams.get('utm_content'),
        term: referUrl.searchParams.get('utm_term'),
      }
    : { source: null, medium: null, campaign: null, content: null, term: null };

  // 4. Insert order + order_items in a "transaction" (best-effort, no real BEGIN
  //    available in supabase-js; safe enough because of the unique constraints).
  const status =
    parsed.data.method === 'mercadopago' ? 'pending_payment' : 'pending_yape_review';

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({
      event_id: event.id,
      brand_id: event.brand_id,
      buyer_name: parsed.data.buyerName,
      buyer_email: parsed.data.buyerEmail.toLowerCase(),
      buyer_phone: parsed.data.buyerPhone,
      buyer_age_ok: true,
      marketing_opt_in: parsed.data.marketingOptIn,
      payment_method: parsed.data.method,
      subtotal_cents: totalCents,
      total_cents: totalCents,
      status,
      ip_address: ip,
      user_agent: userAgent,
      utm_source: utm.source,
      utm_medium: utm.medium,
      utm_campaign: utm.campaign,
      utm_content: utm.content,
      utm_term: utm.term,
    })
    .select('id')
    .single();
  if (orderErr || !order) {
    return { ok: false, message: orderErr?.message ?? 'No se pudo crear la orden.' };
  }

  // Bind this session's existing reservations to the new order so they aren't
  // swept while payment is in flight. If there were no live reservations
  // (e.g. user reloaded with quantities), this is a no-op.
  await admin.rpc('attach_reservation_to_order', {
    p_session_id: parsed.data.sessionId,
    p_order_id: order.id,
  });

  const { error: itemsErr } = await admin.from('order_items').insert(
    resolved.map((r) => ({
      order_id: order.id,
      ticket_type_id: r.id,
      ticket_type_name: r.name,
      quantity: r.quantity,
      unit_price_cents: r.price_cents,
      subtotal_cents: r.price_cents * r.quantity,
    }))
  );
  if (itemsErr) {
    return { ok: false, message: itemsErr.message };
  }

  // Promo code: validate + apply ATOMICALLY (rewrites order_items + order to
  // the discounted price over the active phase, frozen). The client never
  // dictates the amount; the RPC recomputes it server-side.
  // M1 (0020): apply_promo_to_order ya NO confía en p_items — deriva las líneas
  // (tipo/cantidad/base) de order_items congelados. p_items quedó vestigial
  // (se sigue mandando por compat two-phase; el RPC lo ignora).
  const promoCode = (parsed.data.promoCode ?? '').trim();
  let isFree = false;
  if (promoCode) {
    const { data: applyRes, error: applyErr } = await admin.rpc('apply_promo_to_order', {
      p_order_id: order.id,
      p_event_id: event.id,
      p_code: promoCode,
      p_email: parsed.data.buyerEmail.toLowerCase(),
      p_items: resolved.map((r) => ({ ticket_type_id: r.id, quantity: r.quantity })),
    });
    if (applyErr || !applyRes) {
      await admin.from('orders').update({ status: 'failed' }).eq('id', order.id);
      await admin.rpc('release_stock_reservations_for_order', { p_order_id: order.id });
      return { ok: false, message: mapPromoError(applyErr?.message ?? '') };
    }
    const promo = applyRes as {
      is_free?: boolean;
      total_final_cents?: number;
      breakdown?: { ticket_type_id: string; final_cents: number }[];
    };
    isFree = promo.is_free === true;
    totalCents = promo.total_final_cents ?? totalCents;
    const finalByType = new Map((promo.breakdown ?? []).map((b) => [b.ticket_type_id, b.final_cents]));
    for (const r of resolved) r.price_cents = finalByType.get(r.id) ?? r.price_cents;
  }

  await admin.from('events_log').insert({
    brand_id: event.brand_id,
    event_id: event.id,
    order_id: order.id,
    type: 'order_created',
    payload: { method: parsed.data.method, total_cents: totalCents, promo: promoCode || null },
  });

  // 5. Branch by method.
  // MercadoPago requires absolute URLs in back_urls/notificationUrl — relative
  // paths are not accepted by MP's API. For everything else, return a relative
  // path so the browser stays on whatever host it already is on (immune to CF
  // Worker host-rewrite surprises).
  const baseUrl = `${proto}://${host}`;
  const eventBase = `/${event.slug}`;

  // Free order (100% off promo): mark paid, issue tickets + email, skip payment.
  if (isFree) {
    await markOrderPaid(order.id);
    await admin.rpc('mark_promo_redemption_consumed', { p_order_id: order.id });
    const issue = await issueTicketsForOrder({ orderId: order.id, reason: 'yape_approved' });
    if (issue.ok) {
      await sendTicketEmail(order.id);
    } else {
      // Order is paid (free) but ticket issuance failed — log loudly for manual
      // re-issue. The confirmation page polls, so the buyer keeps refreshing.
      await admin.from('events_log').insert({
        brand_id: event.brand_id,
        event_id: event.id,
        order_id: order.id,
        type: 'tickets_issue_failed',
        payload: { error: issue.error, flow: 'free_promo' },
      });
    }
    await admin.rpc('release_stock_reservations_for_order', { p_order_id: order.id });
    return { ok: true, redirectUrl: `${eventBase}/confirmacion?order=${order.id}` };
  }

  if (parsed.data.method === 'mercadopago') {
    try {
      const pref = await createMercadoPagoPreference({
        brandId: event.brand_id,
        orderId: order.id,
        eventName: event.name,
        items: resolved.map((r) => ({
          id: r.id,
          title: `${r.name} · ${event.name}`,
          quantity: r.quantity,
          unitPrice: r.price_cents / 100,
        })),
        payer: {
          name: parsed.data.buyerName,
          email: parsed.data.buyerEmail,
          phone: parsed.data.buyerPhone,
        },
        backUrls: {
          success: `${baseUrl}${eventBase}/confirmacion?order=${order.id}`,
          failure: `${baseUrl}${eventBase}?pago=fallido`,
          pending: `${baseUrl}${eventBase}/confirmacion?order=${order.id}&pendiente=1`,
        },
        // SECURITY: the webhook URL MUST come from a TRUSTED host, never from
        // the request's x-forwarded-host (attacker-controllable → MP would send
        // payment webhooks to an arbitrary domain). back_urls keep the request
        // host so the buyer returns to the brand subdomain; the webhook is the
        // canonical app host.
        notificationUrl: `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/webhooks/mp/${event.brand_id}`,
        externalReference: order.id,
        encryptionKey: serverEnv.BRAND_CREDS_ENCRYPTION_KEY,
      });
      await admin
        .from('orders')
        .update({ mp_preference_id: pref.id })
        .eq('id', order.id);
      // The order stays PENDING. The ticket is emitted only when the MP webhook
      // (2.3) confirms the approved payment — never here.
      return { ok: true, mp: { preferenceId: pref.id, initPoint: pref.initPoint } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MercadoPago no disponible';
      // Cancel the order and free the held stock so other buyers can take it.
      await admin.from('orders').update({ status: 'failed' }).eq('id', order.id);
      await admin.rpc('release_stock_reservations_for_order', { p_order_id: order.id });
      await admin.rpc('release_promo_redemption_for_order', { p_order_id: order.id });
      return { ok: false, message };
    }
  }

  // Yape manual → relative redirect keeps the brand subdomain intact.
  return { ok: true, redirectUrl: `${eventBase}/yape?order=${order.id}` };
}

export type PromoPreview =
  | { ok: true; isFree: boolean; totalFinalCents: number; totalDiscountCents: number }
  | { ok: false; reason: string };

// Read-only promo preview for the checkout UI. Never consumes; the authoritative
// amount is computed by apply_promo_to_order at checkout. Discount is server-side.
export async function previewPromo(input: {
  eventId: string;
  code: string;
  email: string;
  items: { ticketTypeId: string; quantity: number }[];
}): Promise<PromoPreview> {
  const code = (input.code ?? '').trim();
  if (code.length < 2) return { ok: false, reason: 'NOT_FOUND' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email ?? '')) return { ok: false, reason: 'NEED_EMAIL' };
  if (!Array.isArray(input.items) || input.items.length === 0) return { ok: false, reason: 'NO_ITEMS' };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('preview_promo', {
    p_event_id: input.eventId,
    p_code: code,
    p_email: input.email.toLowerCase(),
    p_items: input.items.map((i) => ({ ticket_type_id: i.ticketTypeId, quantity: i.quantity })),
  });
  if (error || !data) return { ok: false, reason: 'ERROR' };
  const r = data as {
    ok?: boolean; reason?: string; is_free?: boolean; total_final_cents?: number; total_discount_cents?: number;
  };
  if (!r.ok) return { ok: false, reason: r.reason ?? 'ERROR' };
  return {
    ok: true,
    isFree: r.is_free === true,
    totalFinalCents: r.total_final_cents ?? 0,
    totalDiscountCents: r.total_discount_cents ?? 0,
  };
}
