import { customAlphabet } from 'nanoid';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';

// Human-readable ticket number for display (the QR itself is a UUID v4).
const NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ticketNumberGen = customAlphabet(NUMBER_ALPHABET, 4);

export function generateTicketNumber(): string {
  return `TKT/${ticketNumberGen()}-${ticketNumberGen()}`;
}

type IssueTicketsInput = {
  orderId: string;
  // 'free_event' es su propio motivo: la emisión de un evento gratis no pasó
  // por Yape ni por MercadoPago, y etiquetarla como 'yape_approved' deja un
  // log que miente justo cuando hay que reconstruir qué pasó.
  reason: 'mp_paid' | 'yape_approved' | 'free_event';
};

type IssueTicketsResult =
  | { ok: true; ticketIds: string[]; alreadyIssued: boolean }
  | { ok: false; error: string };

// Atomically issues tickets for a paid order. Idempotent: if tickets already
// exist for this order, returns them without creating duplicates.
//
// CRITICAL: this function is the join between "money received" and "QR codes
// exist". It must be called only after payment is verified server-side.
//
// La emisión real (idempotencia + GATE de cupo + insert con max_scans + release
// de reservas) vive ATÓMICAMENTE en la RPC issue_tickets_atomic (migr 0031), bajo
// lock de la orden: dos disparos de la MISMA orden no duplican, y NUNCA se emite
// por encima del aforo (caso raro: la reserva expiró y el cupo se revendió antes
// de la aprobación → action 'oversold_no_capacity', no se emite). Esta función es
// un wrapper delgado que preserva el contrato (ticketIds/alreadyIssued) y deja la
// observabilidad (events_log) del lado de la app.
export async function issueTicketsForOrder(
  input: IssueTicketsInput
): Promise<IssueTicketsResult> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc('issue_tickets_atomic', {
    p_order_id: input.orderId,
  });
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'No se pudieron emitir tickets' };
  }
  const res = data as {
    ok: boolean;
    action: string;
    ticket_count?: number;
    detail?: Json;
  };

  if (!res.ok) {
    if (res.action === 'oversold_no_capacity') {
      // El cupo se agotó entre la reserva y la emisión. NO se emite por encima
      // del aforo. Log forense para reembolso/decisión manual del organizador.
      const { data: ord } = await admin
        .from('orders')
        .select('brand_id, event_id')
        .eq('id', input.orderId)
        .maybeSingle();
      if (ord) {
        await admin.from('events_log').insert({
          brand_id: ord.brand_id,
          event_id: ord.event_id,
          order_id: input.orderId,
          type: 'oversold_no_capacity',
          payload: { flow: input.reason, detail: res.detail ?? null },
        });
      }
    }
    return { ok: false, error: res.action };
  }

  // ok: 'issued' | 'already_issued'. Recuperar ids para el contrato existente.
  const { data: tk } = await admin
    .from('tickets')
    .select('id')
    .eq('order_id', input.orderId);
  const ticketIds = (tk ?? []).map((t) => t.id);
  const alreadyIssued = res.action === 'already_issued';

  if (!alreadyIssued) {
    const { data: ord } = await admin
      .from('orders')
      .select('brand_id, event_id')
      .eq('id', input.orderId)
      .maybeSingle();
    if (ord) {
      await admin.from('events_log').insert({
        brand_id: ord.brand_id,
        event_id: ord.event_id,
        order_id: input.orderId,
        type:
          input.reason === 'mp_paid' ? 'tickets_issued_mp'
          : input.reason === 'free_event' ? 'tickets_issued_free'
          : 'tickets_issued_yape',
        payload: { count: ticketIds.length },
      });
    }
  }

  return { ok: true, ticketIds, alreadyIssued };
}

// NOTA: acá vivía markOrderPaid(), que marcaba una orden como pagada por fuera
// de settle_mp_payment. Se borró (2026-09-22) por dos motivos: no tenía ningún
// caller en toda la app, y era un segundo camino para tocar el estado de una
// orden cobrada. La ÚNICA puerta de liquidación de MercadoPago es
// settle_mp_payment (0025, SECURITY DEFINER con revoke explícito), que es
// atómica e idempotente por mp_payment_id. Si alguna vez hace falta marcar una
// orden a mano, que sea por ahí y no por una función suelta.
