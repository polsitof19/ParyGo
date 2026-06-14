'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { isImpersonating } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { issueTicketsForOrder } from '@/lib/tickets';
import { sendTicketEmail } from '@/lib/email/sendTicketEmail';

export type CourtesyState = { ok: boolean; message: string | null };

// Tope anti-abuso por operación (un error no emite miles de un saque).
const MAX_PER_OP = 100;

const schema = z.object({
  eventId: z.string().uuid(),
  ticketTypeId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(MAX_PER_OP),
  email: z.string().email().max(120),
});

// Emite N cortesías de un tipo y las manda por email a una casilla elegida.
// EMITE ENTRADAS REALES. Reusa el camino atómico (reserve_order_stock +
// issue_tickets_atomic) → cuenta contra el aforo (no se puede pasar capacity en
// tipos limitados; ilimitado sin tope) y hereda max_scans (1 QR = 1 entrada).
export async function issueCourtesyTicketsAction(
  _prev: CourtesyState,
  formData: FormData
): Promise<CourtesyState> {
  const user = await requireSession();
  const parsed = schema.safeParse({
    eventId: formData.get('event_id'),
    ticketTypeId: formData.get('ticket_type_id'),
    quantity: formData.get('quantity'),
    email: formData.get('email'),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors[0]?.message ?? `Datos inválidos (máx ${MAX_PER_OP} por envío).` };
  }

  const admin = createAdminClient();

  // GUARD: el evento debe ser de una marca donde el usuario es dueño (brand_admin),
  // o super admin NO impersonando. brand_id sale del ROW del evento, nunca del
  // form → cero cross-tenant.
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, name')
    .eq('id', parsed.data.eventId)
    .maybeSingle();
  if (!event || !event.brand_id) return { ok: false, message: 'Evento no encontrado.' };
  const authorized =
    (user.isSuperAdmin && !isImpersonating()) ||
    user.brandMemberships.some((m) => m.brandId === event.brand_id && m.role === 'brand_admin');
  if (!authorized) return { ok: false, message: 'No tenés permiso sobre este evento.' };

  // TENANCY: el tipo de entrada debe pertenecer a ESTE evento (no de otro/otra marca).
  const { data: tt } = await admin
    .from('ticket_types')
    .select('id, name, is_active, event_id')
    .eq('id', parsed.data.ticketTypeId)
    .maybeSingle();
  if (!tt || tt.event_id !== event.id) return { ok: false, message: 'Ese tipo de entrada no es de este evento.' };
  if (!tt.is_active) return { ok: false, message: 'Ese tipo de entrada no está activo.' };

  const email = parsed.data.email.trim().toLowerCase();
  const qty = parsed.data.quantity;

  // 1. Orden de cortesía (total 0, payment_method=courtesy).
  const { data: order, error: oerr } = await admin
    .from('orders')
    .insert({
      event_id: event.id,
      brand_id: event.brand_id,
      buyer_name: 'Cortesía',
      buyer_email: email,
      buyer_phone: '-',
      buyer_age_ok: true,
      marketing_opt_in: false,
      payment_method: 'courtesy',
      subtotal_cents: 0,
      total_cents: 0,
    })
    .select('id')
    .single();
  if (oerr || !order) return { ok: false, message: oerr?.message ?? 'No se pudo crear la cortesía.' };

  // 2. order_items (precio 0).
  const { error: ierr } = await admin.from('order_items').insert({
    order_id: order.id,
    ticket_type_id: tt.id,
    ticket_type_name: tt.name,
    quantity: qty,
    unit_price_cents: 0,
    subtotal_cents: 0,
  });
  if (ierr) {
    await admin.from('orders').update({ status: 'failed' }).eq('id', order.id);
    return { ok: false, message: ierr.message };
  }

  // 3. reserve_order_stock — descuenta aforo (ledger 0031). En tipo LIMITADO no
  //    deja pasar la capacity; ilimitado sin tope.
  const { error: rerr } = await admin.rpc('reserve_order_stock', {
    p_order_id: order.id,
    p_session_id: `courtesy-${order.id}`,
  });
  if (rerr) {
    await admin.from('orders').update({ status: 'failed' }).eq('id', order.id);
    await admin.rpc('release_stock_reservations_for_order', { p_order_id: order.id });
    const agotado = /insufficient_stock/.test(rerr.message ?? '');
    return {
      ok: false,
      message: agotado
        ? `No hay cupo para ${qty} cortesías de ${tt.name} (no podés pasar la capacidad del tipo).`
        : 'No se pudo reservar el cupo. Intentá de nuevo.',
    };
  }

  // 4. Emisión ATÓMICA (gate duro de cupo + flip a paid + hereda max_scans + release).
  const issue = await issueTicketsForOrder({ orderId: order.id, reason: 'yape_approved' });
  if (!issue.ok) {
    await admin.from('orders').update({ status: 'failed' }).eq('id', order.id);
    await admin.rpc('release_stock_reservations_for_order', { p_order_id: order.id });
    return {
      ok: false,
      message: issue.error === 'oversold_no_capacity'
        ? `No hay cupo para ${qty} cortesías de ${tt.name}.`
        : `No se pudieron emitir las cortesías: ${issue.error}`,
    };
  }

  // 5. Email con los N QR al destino (best-effort: los tickets ya existen).
  const emailRes = await sendTicketEmail(order.id);

  // 6. Trazabilidad: quién emitió cuántas, de qué tipo, a qué email.
  await admin.from('events_log').insert({
    brand_id: event.brand_id,
    event_id: event.id,
    order_id: order.id,
    actor_user_id: user.id,
    type: 'courtesy_issued',
    payload: { ticket_type_id: tt.id, ticket_type_name: tt.name, qty, email, email_sent: emailRes.ok },
  });

  revalidatePath(`/admin/events/${event.id}`);
  return {
    ok: true,
    message: emailRes.ok
      ? `Listo: ${qty} ${tt.name} de cortesía enviadas a ${email}.`
      : `Emitidas ${qty} ${tt.name}, pero el email a ${email} falló — reenvialo desde la orden.`,
  };
}
