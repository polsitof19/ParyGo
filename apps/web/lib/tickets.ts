import { customAlphabet } from 'nanoid';
import { createAdminClient } from '@/lib/supabase/admin';

// Human-readable ticket number for display (the QR itself is a UUID v4).
const NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ticketNumberGen = customAlphabet(NUMBER_ALPHABET, 4);

export function generateTicketNumber(): string {
  return `TKT/${ticketNumberGen()}-${ticketNumberGen()}`;
}

type IssueTicketsInput = {
  orderId: string;
  reason: 'mp_paid' | 'yape_approved';
};

type IssueTicketsResult =
  | { ok: true; ticketIds: string[]; alreadyIssued: boolean }
  | { ok: false; error: string };

// Atomically issues tickets for a paid order. Idempotent: if tickets already
// exist for this order, returns them without creating duplicates.
//
// CRITICAL: this function is the join between "money received" and "QR codes
// exist". It must be called only after payment is verified server-side.
export async function issueTicketsForOrder(
  input: IssueTicketsInput
): Promise<IssueTicketsResult> {
  const admin = createAdminClient();

  // 1. Idempotency check: do we already have tickets for this order?
  const { data: existing } = await admin
    .from('tickets')
    .select('id')
    .eq('order_id', input.orderId);
  if (existing && existing.length > 0) {
    return {
      ok: true,
      ticketIds: existing.map((t) => t.id),
      alreadyIssued: true,
    };
  }

  // 2. Load order + items.
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, event_id, brand_id, status, buyer_name')
    .eq('id', input.orderId)
    .single();
  if (orderErr || !order) {
    return { ok: false, error: 'Orden no encontrada' };
  }

  const { data: items } = await admin
    .from('order_items')
    .select('id, ticket_type_id, ticket_type_name, quantity')
    .eq('order_id', input.orderId);
  if (!items || items.length === 0) {
    return { ok: false, error: 'Orden sin items' };
  }

  // 3. Build ticket rows: one per quantity unit.
  const rows: Array<{
    order_id: string;
    event_id: string;
    brand_id: string;
    ticket_type_id: string;
    ticket_type_name: string;
    ticket_number: string;
    attendee_name: string | null;
  }> = [];
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      rows.push({
        order_id: order.id,
        event_id: order.event_id,
        brand_id: order.brand_id,
        ticket_type_id: item.ticket_type_id,
        ticket_type_name: item.ticket_type_name,
        ticket_number: generateTicketNumber(),
        attendee_name: order.buyer_name,
      });
    }
  }

  // 4. Insert. qr_code defaults to uuid_generate_v4() at DB level.
  const { data: created, error: insertErr } = await admin
    .from('tickets')
    .insert(rows)
    .select('id, qr_code');

  if (insertErr || !created) {
    return { ok: false, error: insertErr?.message ?? 'No se pudieron crear tickets' };
  }

  // 5. Log + audit.
  await admin.from('events_log').insert({
    brand_id: order.brand_id,
    event_id: order.event_id,
    order_id: order.id,
    type: input.reason === 'mp_paid' ? 'tickets_issued_mp' : 'tickets_issued_yape',
    payload: { count: created.length },
  });

  return {
    ok: true,
    ticketIds: created.map((t) => t.id),
    alreadyIssued: false,
  };
}

// Mark an order paid (idempotent: only updates if not already paid).
export async function markOrderPaid(
  orderId: string,
  details: {
    mpPaymentId?: string;
    mpPaymentStatus?: string;
  } = {}
): Promise<{ alreadyPaid: boolean }> {
  const admin = createAdminClient();
  const { data: current } = await admin
    .from('orders')
    .select('status, paid_at')
    .eq('id', orderId)
    .single();
  if (current?.status === 'paid' && current?.paid_at) {
    return { alreadyPaid: true };
  }
  await admin
    .from('orders')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      mp_payment_id: details.mpPaymentId ?? null,
      mp_payment_status: details.mpPaymentStatus ?? null,
    })
    .eq('id', orderId);
  return { alreadyPaid: false };
}
