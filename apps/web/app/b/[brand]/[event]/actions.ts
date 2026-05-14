'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { createMercadoPagoPreference } from '@/lib/mercadopago';

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
};

export type CheckoutResult =
  | { ok: true; redirectUrl: string }
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
});

export async function startCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors[0]?.message ?? 'Datos inválidos' };
  }

  const admin = createAdminClient();
  const reqHeaders = headers();
  const host = reqHeaders.get('host') ?? '';
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
    .select('id, name, price_cents, capacity, sold, is_active, event_id')
    .in('id', ticketTypeIds);
  if (!tts || tts.length !== ticketTypeIds.length) {
    return { ok: false, message: 'Tipo de entrada inválido.' };
  }

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
    const remaining = tt.capacity - tt.sold;
    if (remaining < item.quantity) {
      return {
        ok: false,
        message: `Stock insuficiente para ${tt.name}. Quedan ${remaining}.`,
      };
    }
    totalCents += tt.price_cents * item.quantity;
    resolved.push({
      id: tt.id,
      name: tt.name,
      price_cents: tt.price_cents,
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

  await admin.from('events_log').insert({
    brand_id: event.brand_id,
    event_id: event.id,
    order_id: order.id,
    type: 'order_created',
    payload: { method: parsed.data.method, total_cents: totalCents },
  });

  // 5. Branch by method.
  const baseUrl = `${proto}://${host}`;
  const eventBase = `${baseUrl}/${event.slug}`;

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
          success: `${eventBase}/confirmacion?order=${order.id}`,
          failure: `${eventBase}?pago=fallido`,
          pending: `${eventBase}/confirmacion?order=${order.id}&pendiente=1`,
        },
        notificationUrl: `${baseUrl}/api/webhooks/mp/${event.brand_id}`,
        externalReference: order.id,
        encryptionKey: serverEnv.BRAND_CREDS_ENCRYPTION_KEY,
      });
      await admin
        .from('orders')
        .update({ mp_preference_id: pref.id })
        .eq('id', order.id);
      return { ok: true, redirectUrl: pref.initPoint };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MercadoPago no disponible';
      // Cancel the order so stock isn't held forever
      await admin.from('orders').update({ status: 'failed' }).eq('id', order.id);
      return { ok: false, message };
    }
  }

  // Yape manual → bounce to Yape upload screen
  return { ok: true, redirectUrl: `${eventBase}/yape?order=${order.id}` };
}
