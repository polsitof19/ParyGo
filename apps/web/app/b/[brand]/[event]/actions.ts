'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv, publicEnv } from '@/lib/env';
import { createMercadoPagoPreference } from '@/lib/mercadopago';
import { issueTicketsForOrder } from '@/lib/tickets';
import { sendTicketEmail } from '@/lib/email/sendTicketEmail';

export type CheckoutInput = {
  eventId: string;
  brandId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerDocType: 'dni' | 'ce' | 'passport';
  buyerDni: string;
  ageOk: boolean;
  marketingOptIn: boolean;
  method: 'yape_manual' | 'mercadopago';
  // attendeeNames: nombre por entrada (índice = unidad). Solo se persiste si el
  // evento pide nombres (collect_attendee_names); el server nunca confía en esto
  // para nada sensible — es solo una etiqueta del ticket.
  items: { ticketTypeId: string; quantity: number; attendeeNames?: string[] }[];
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
  buyerDocType: z.enum(['dni', 'ce', 'passport']),
  // El formato del documento se valida server-side MÁS ABAJO, solo si el evento
  // pide DNI (require_dni). Acá lo dejamos laxo para no romper cuando el evento
  // NO lo exige (el campo ni se renderiza en el checkout).
  buyerDni: z.string().trim().max(20),
  ageOk: z.boolean(), // se exige solo si el evento pide confirmación (chequeo abajo)
  marketingOptIn: z.boolean(),
  method: z.enum(['yape_manual', 'mercadopago']),
  items: z
    .array(
      z.object({
        ticketTypeId: z.string().uuid(),
        quantity: z.number().int().min(1).max(10),
        attendeeNames: z.array(z.string().trim().max(120)).max(10).optional(),
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
    .select('id, slug, name, brand_id, is_published, min_age, archived_at, require_age_confirmation, require_dni, collect_attendee_names')
    .eq('id', parsed.data.eventId)
    .maybeSingle();
  if (!event || !event.is_published || event.archived_at) {
    return { ok: false, message: 'Evento no disponible.' };
  }
  if (event.brand_id !== parsed.data.brandId) {
    return { ok: false, message: 'Marca/evento no coinciden.' };
  }
  // Confirmación de edad: server-side, solo si el evento la pide (configurable).
  if (event.require_age_confirmation && !parsed.data.ageOk) {
    return { ok: false, message: `Tenés que confirmar que sos mayor de ${event.min_age} años.` };
  }
  // Documento de identidad: server-side, solo si el evento lo pide (configurable).
  // DNI peruano = exactamente 8 dígitos. CE/pasaporte = alfanumérico 6-15.
  if (event.require_dni) {
    const doc = parsed.data.buyerDni.trim();
    const docOk =
      parsed.data.buyerDocType === 'dni'
        ? /^\d{8}$/.test(doc)
        : /^[A-Za-z0-9]{6,15}$/.test(doc);
    if (!docOk) {
      return {
        ok: false,
        message: parsed.data.buyerDocType === 'dni' ? 'El DNI debe tener 8 dígitos.' : 'Documento inválido.',
      };
    }
  }
  // La marca tampoco puede estar archivada (no confiar solo en la página).
  const { data: brandRow } = await admin
    .from('brands')
    .select('archived_at')
    .eq('id', event.brand_id)
    .maybeSingle();
  if (!brandRow || brandRow.archived_at) {
    return { ok: false, message: 'Evento no disponible.' };
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
    attendeeNames: string[] | null;
  };
  const resolved: Resolved[] = [];
  for (const item of parsed.data.items) {
    const tt = tts.find((t) => t.id === item.ticketTypeId);
    if (!tt || !tt.is_active || tt.event_id !== event.id) {
      return { ok: false, message: 'Tipo de entrada no disponible.' };
    }
    // El cupo NO se valida acá (era un chequeo `capacity - sold` sin lock, sin
    // restar reservas y sin exigir reserva → permitía sobreventa en alta
    // concurrencia). La decisión de stock es ATÓMICA y se toma más abajo en
    // reserve_order_stock (migr 0031), bajo lock de fila. Ilimitados: excluidos ahí.
    // Active-phase price (fallback to base price_cents if no phase rows).
    const unitPrice = activePriceByType.get(tt.id) ?? tt.price_cents;
    totalCents += unitPrice * item.quantity;
    // Nombres por entrada: solo si el evento los pide. Recortamos a la cantidad
    // comprada (no guardar más nombres que unidades) y limpiamos vacíos al final.
    let attendeeNames: string[] | null = null;
    if (event.collect_attendee_names && Array.isArray(item.attendeeNames)) {
      const names = item.attendeeNames.slice(0, item.quantity).map((n) => (n ?? '').trim().slice(0, 120));
      attendeeNames = names.some((n) => n.length > 0) ? names : null;
    }
    resolved.push({
      id: tt.id,
      name: tt.name,
      price_cents: unitPrice,
      quantity: item.quantity,
      attendeeNames,
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
      buyer_dni: event.require_dni ? parsed.data.buyerDni : null,
      buyer_doc_type: parsed.data.buyerDocType, // NOT NULL en BD; sin DNI queda 'dni' inerte
      buyer_age_ok: parsed.data.ageOk,
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
      attendee_names: r.attendeeNames,
    }))
  );
  if (itemsErr) {
    return { ok: false, message: itemsErr.message };
  }

  // GATE ATÓMICO anti-oversell (B2, migr 0031). Reserva los cupos de los tipos
  // LIMITADOS de la orden bajo lock de fila, derivando las cantidades de
  // order_items (server-trusted, recién insertados). Imposible que dos compras
  // tomen el mismo último lugar. Si algún tipo está agotado → falla la orden y
  // libera. Ilimitados (Almighty) se excluyen dentro del RPC (camino intacto).
  const { error: reserveErr } = await admin.rpc('reserve_order_stock', {
    p_order_id: order.id,
    p_session_id: parsed.data.sessionId,
  });
  if (reserveErr) {
    await admin.from('orders').update({ status: 'failed' }).eq('id', order.id);
    await admin.rpc('release_stock_reservations_for_order', { p_order_id: order.id });
    const agotado = /insufficient_stock/.test(reserveErr.message ?? '');
    return {
      ok: false,
      message: agotado
        ? 'Se agotaron las entradas mientras completabas la compra.'
        : 'No se pudo reservar el stock. Intentá de nuevo.',
    };
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

  // Free order (100% off promo): issue_tickets_atomic hace gate de cupo + flip a
  // paid + consumo de promo + emisión + release, TODO atómico (migr 0034). Si el
  // cupo se agotó NO deja la orden paid-sin-QR. Solo resta el email.
  if (isFree) {
    const issue = await issueTicketsForOrder({ orderId: order.id, reason: 'yape_approved' });
    if (issue.ok) {
      await sendTicketEmail(order.id);
      return { ok: true, redirectUrl: `${eventBase}/confirmacion?order=${order.id}` };
    }
    // No se pudo emitir (incl. oversold_no_capacity): NO marcamos pagada. Fallar
    // la orden y liberar el hold. issueTicketsForOrder ya logueó el detalle.
    await admin.from('orders').update({ status: 'failed' }).eq('id', order.id);
    await admin.rpc('release_promo_redemption_for_order', { p_order_id: order.id });
    await admin.rpc('release_stock_reservations_for_order', { p_order_id: order.id });
    const agotado = issue.error === 'oversold_no_capacity';
    return {
      ok: false,
      message: agotado
        ? 'Se agotaron las entradas mientras completabas la compra.'
        : 'No se pudieron emitir las entradas. Intentá de nuevo.',
    };
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
