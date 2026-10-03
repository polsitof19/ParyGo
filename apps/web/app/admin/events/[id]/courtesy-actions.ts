'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { puedeEscribirComoSuper } from '@/lib/impersonation';
import { auditarEscrituraSuper } from '@/lib/auditoriaSuper';
import { createAdminClient } from '@/lib/supabase/admin';
import { issueTicketsForOrder } from '@/lib/tickets';
import { sendTicketEmail } from '@/lib/email/sendTicketEmail';
import { textosPanel } from '@/lib/idiomaServer';

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
  const { t } = await textosPanel();
  const parsed = schema.safeParse({
    eventId: formData.get('event_id'),
    ticketTypeId: formData.get('ticket_type_id'),
    quantity: formData.get('quantity'),
    email: formData.get('email'),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors[0]?.message ?? t(`Datos inválidos (máx ${MAX_PER_OP} por envío).`, `Invalid data (max ${MAX_PER_OP} per submission).`) };
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
  if (!event || !event.brand_id) return { ok: false, message: t('Evento no encontrado.', 'Event not found.') };
  // Quién escribe: el dueño por su membresía, o el super admin — desde la
  // cabina, o DENTRO de la marca con el modo edición encendido. Viendo la
  // marca sin ese modo, no pasa.
  const modoSuper = puedeEscribirComoSuper(user, event.brand_id as string);
  const authorized =
    modoSuper !== null ||
    user.brandMemberships.some((m) => m.brandId === event.brand_id && m.role === 'brand_admin');
  if (!authorized) return { ok: false, message: t('No tienes permiso sobre este evento.', 'You do not have permission over this event.') };

  // TENANCY: el tipo de entrada debe pertenecer a ESTE evento (no de otro/otra marca).
  const { data: tt } = await admin
    .from('ticket_types')
    .select('id, name, is_active, event_id')
    .eq('id', parsed.data.ticketTypeId)
    .maybeSingle();
  if (!tt || tt.event_id !== event.id) return { ok: false, message: t('Ese tipo de entrada no es de este evento.', 'That ticket type does not belong to this event.') };
  if (!tt.is_active) return { ok: false, message: t('Ese tipo de entrada no está activo.', 'That ticket type is not active.') };

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
  if (oerr || !order) return { ok: false, message: oerr?.message ?? t('No se pudo crear la cortesía.', 'Could not create the complimentary ticket.') };

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
        ? t(`No hay cupo para ${qty} cortesías de ${tt.name} (no puedes pasar la capacidad del tipo).`, `No room for ${qty} complimentary tickets of ${tt.name} (you can't go over the ticket type's capacity).`)
        : t('No se pudo reservar el cupo. Intenta de nuevo.', 'Could not reserve the capacity. Try again.'),
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
        ? t(`No hay cupo para ${qty} cortesías de ${tt.name}.`, `No room for ${qty} complimentary tickets of ${tt.name}.`)
        : t(`No se pudieron emitir las cortesías: ${issue.error}`, `Could not issue the complimentary tickets: ${issue.error}`),
    };
  }

  // 5. Email con los N QR al destino (best-effort: los tickets ya existen).
  const emailRes = await sendTicketEmail(order.id);
  // "Enviado" = salió de verdad (o ya había salido). 'skipped' (p. ej. sin
  // RESEND_API_KEY) es ok:true pero NO es un envío: no reportarlo como tal.
  const emailSent = emailRes.ok && (emailRes.status === 'sent' || emailRes.status === 'already_sent');

  // 6. Trazabilidad: quién emitió cuántas, de qué tipo, a qué email.
  await admin.from('events_log').insert({
    brand_id: event.brand_id,
    event_id: event.id,
    order_id: order.id,
    actor_user_id: user.id,
    type: 'courtesy_issued',
    payload: { ticket_type_id: tt.id, ticket_type_name: tt.name, qty, email, email_sent: emailSent, email_status: emailRes.status },
  });
  await auditarEscrituraSuper(admin, { user, modo: modoSuper, brandId: event.brand_id as string, eventId: parsed.data.eventId, accion: 'courtesy_issued', diff: { ticket_type_id: parsed.data.ticketTypeId, cantidad: parsed.data.quantity, email: parsed.data.email } });

  revalidatePath(`/admin/events/${event.id}`);
  revalidatePath(`/admin/events/${event.id}/cortesias`);
  return {
    ok: true,
    message: emailSent
      ? t(`Listo: ${qty} ${tt.name} de cortesía enviadas a ${email}.`, `Done: ${qty} ${tt.name} complimentary tickets sent to ${email}.`)
      : t(`Emitidas ${qty} ${tt.name}, pero el email a ${email} no se envió — reenvíalo desde la orden.`, `Issued ${qty} ${tt.name}, but the email to ${email} was not sent — resend it from the order.`),
  };
}
