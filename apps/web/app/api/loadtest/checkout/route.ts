import { NextResponse, type NextRequest } from 'next/server';

// =============================================================
// POST /api/loadtest/checkout — ENDPOINT EXCLUSIVO DE PRUEBA DE CARGA (Fase 5)
// =============================================================
// startCheckout es un Server Action (protocolo RSC, action-id por build) → k6 no
// lo puede pegar de forma estable. Este endpoint espeja el camino Yape de
// startCheckout como un POST JSON limpio, server-trusted, para medir el trabajo
// real del checkout end-to-end bajo carga.
//
// TRIPLE BLINDAJE (inerte y seguro en prod):
//   1. 404 salvo LOADTEST_ENABLED === 'true'  (jamás seteado en prod).
//   2. 403 si NEXT_PUBLIC_SUPABASE_URL apunta al ref de PROD (defensa dura:
//      aunque por error se habilite contra prod, se niega a escribir).
//   3. 401 sin Bearer LOADTEST_SECRET.
// NUNCA usar en producción. Solo vive activo en el deploy de carga (contra el clon).
// =============================================================

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const PROD_REF = 'mdxtpevisjiqpeklhxdv'; // ref de PROD — guard, no secreto.

export async function POST(req: NextRequest) {
  if (process.env.LOADTEST_ENABLED !== 'true') {
    return NextResponse.json({ ok: false, reason: 'disabled' }, { status: 404 });
  }
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (supaUrl.includes(PROD_REF)) {
    // Se niega a correr contra la base de producción, pase lo que pase.
    return NextResponse.json({ ok: false, reason: 'refuses_on_prod' }, { status: 403 });
  }
  const secret = process.env.LOADTEST_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    eventId?: string; brandId?: string; sessionId?: string;
    items?: { ticketTypeId: string; quantity: number }[];
    buyerEmail?: string; buyerName?: string;
  } | null;
  if (!body?.eventId || !body?.brandId || !body?.sessionId || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ ok: false, reason: 'bad_input' }, { status: 400 });
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  // --- mismo camino server-trusted que startCheckout (rama Yape) ---
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, is_published, archived_at')
    .eq('id', body.eventId)
    .maybeSingle();
  if (!event || !event.is_published || event.archived_at || event.brand_id !== body.brandId) {
    return NextResponse.json({ ok: false, reason: 'event_unavailable' }, { status: 400 });
  }

  const ttIds = body.items.map((i) => i.ticketTypeId);
  const { data: tts } = await admin
    .from('ticket_types')
    .select('id, name, price_cents, is_active, is_unlimited, event_id')
    .in('id', ttIds);
  if (!tts || tts.length !== ttIds.length) {
    return NextResponse.json({ ok: false, reason: 'bad_types' }, { status: 400 });
  }

  const { data: prices } = await admin.rpc('get_event_active_prices', { p_event_id: event.id });
  const priceByType = new Map((prices ?? []).map((r) => [r.ticket_type_id, r.active_price_cents]));

  let total = 0;
  const resolved: { id: string; name: string; price: number; qty: number }[] = [];
  for (const it of body.items) {
    const tt = tts.find((t) => t.id === it.ticketTypeId);
    if (!tt || !tt.is_active || tt.event_id !== event.id) {
      return NextResponse.json({ ok: false, reason: 'type_unavailable' }, { status: 400 });
    }
    const unit = priceByType.get(tt.id) ?? tt.price_cents;
    total += unit * it.quantity;
    resolved.push({ id: tt.id, name: tt.name, price: unit, qty: it.quantity });
  }

  const { data: order, error: oerr } = await admin
    .from('orders')
    .insert({
      event_id: event.id, brand_id: event.brand_id,
      buyer_name: body.buyerName ?? 'LoadTest',
      buyer_email: (body.buyerEmail ?? 'loadtest@example.invalid').toLowerCase(),
      buyer_phone: '999', buyer_dni: '12345678', buyer_doc_type: 'dni',
      buyer_age_ok: true, marketing_opt_in: false, payment_method: 'yape_manual',
      subtotal_cents: total, total_cents: total, status: 'pending_yape_review',
    })
    .select('id')
    .single();
  if (oerr || !order) {
    return NextResponse.json({ ok: false, reason: oerr?.message ?? 'order_failed' }, { status: 500 });
  }

  const { error: ierr } = await admin.from('order_items').insert(
    resolved.map((r) => ({
      order_id: order.id, ticket_type_id: r.id, ticket_type_name: r.name,
      quantity: r.qty, unit_price_cents: r.price, subtotal_cents: r.price * r.qty,
    }))
  );
  if (ierr) return NextResponse.json({ ok: false, reason: ierr.message }, { status: 500 });

  // GATE atómico anti-oversell (mismo que startCheckout).
  const { error: rerr } = await admin.rpc('reserve_order_stock', {
    p_order_id: order.id, p_session_id: body.sessionId,
  });
  if (rerr) {
    await admin.from('orders').update({ status: 'failed' }).eq('id', order.id);
    await admin.rpc('release_stock_reservations_for_order', { p_order_id: order.id });
    const soldOut = /insufficient_stock/.test(rerr.message ?? '');
    return NextResponse.json({ ok: false, reason: soldOut ? 'sold_out' : 'reserve_failed' }, { status: soldOut ? 409 : 500 });
  }

  return NextResponse.json({ ok: true, orderId: order.id });
}
