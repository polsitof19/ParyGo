import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

// ¿Este tipo se ofrece al público?
//
// Hasta la 0056, "precio 0" significaba dos cosas que el sistema no podía
// distinguir: una CORTESÍA de un evento pago (lista de invitados, jamás
// pública) y una entrada de un evento GRATIS de verdad (que sí tiene que
// poder tomarse). Ante la duda se ocultaba todo lo que valiera 0, y los
// eventos gratis quedaban sin camino.
//
// Ahora la intención es explícita y la regla es una sola:
//
//   público = precio > 0  OR  (evento.is_free  AND  NOT tipo.is_courtesy)
//
// O sea: un tipo S/0 de un evento PAGO sigue oculto, exactamente como antes.
// Lo único que cambia es que un evento marcado gratis puede ofrecer sus tipos
// gratis, siempre que no sean cortesías.
export function isPubliclyOffered(
  activePriceCents: number,
  opciones?: { eventoEsGratis?: boolean; esCortesia?: boolean }
): boolean {
  if (activePriceCents > 0) return true;
  return Boolean(opciones?.eventoEsGratis) && !opciones?.esCortesia;
}

// Momento en que el evento deja de vender: ends_at si existe; si no, 18h tras el
// inicio (misma regla que la página y startCheckout — ver comentario allí).
export function eventOverAt(startsAt: string, endsAt: string | null): number {
  return endsAt ? Date.parse(endsAt) : Date.parse(startsAt) + 18 * 3600 * 1000;
}

export type PublicTypeCheck =
  | { ok: true; eventId: string; brandId: string; activePriceCents: number }
  | { ok: false; message: string };

// Guard server-side ÚNICO para cualquier camino público que toque stock
// (reserva del carrito y checkout). Se evalúa ANTES de reservar: un intento
// inválido no puede retener cupo. Nada de esto viene del cliente.
export async function checkPublicTicketType(admin: Admin, ticketTypeId: string): Promise<PublicTypeCheck> {
  const unavailable = { ok: false as const, message: 'Tipo de entrada no disponible.' };
  const { data: tt } = await admin
    .from('ticket_types')
    .select('id, event_id, is_active, price_cents, is_courtesy')
    .eq('id', ticketTypeId)
    .maybeSingle();
  if (!tt || !tt.is_active) return unavailable;

  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, is_published, archived_at, cancelled_at, starts_at, ends_at, is_free')
    .eq('id', tt.event_id)
    .maybeSingle();
  if (!event || !event.brand_id || !event.is_published || event.archived_at || event.cancelled_at) {
    return { ok: false, message: 'Evento no disponible.' };
  }
  const overAt = eventOverAt(event.starts_at, event.ends_at);
  if (Number.isFinite(overAt) && overAt < Date.now()) {
    return { ok: false, message: 'Este evento ya terminó.' };
  }

  const { data: brand } = await admin.from('brands').select('archived_at').eq('id', event.brand_id).maybeSingle();
  if (!brand || brand.archived_at) return { ok: false, message: 'Evento no disponible.' };

  // Precio ACTIVO (fase vigente) del tipo, misma fuente que el checkout.
  const { data: activePrices, error: apErr } = await admin.rpc('get_event_active_prices', { p_event_id: event.id });
  if (apErr) {
    // Sin precio activo confiable no se decide: fail-closed (no se ofrece).
    console.error('[checkPublicTicketType] get_event_active_prices failed', { eventId: event.id, error: apErr.message });
    return unavailable;
  }
  const activePriceCents = (activePrices ?? []).find((r) => r.ticket_type_id === tt.id)?.active_price_cents ?? tt.price_cents;
  // Fail-closed: si el evento no trajo is_free (deploy viejo, fila rara), se
  // comporta como evento pago y el tipo S/0 queda oculto — que es el estado
  // seguro. Nunca al revés.
  if (!isPubliclyOffered(activePriceCents, { eventoEsGratis: event.is_free === true, esCortesia: tt.is_courtesy === true })) {
    return unavailable;
  }

  return { ok: true, eventId: event.id, brandId: event.brand_id, activePriceCents };
}
