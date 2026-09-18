import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

// ¿Se ofrece este tipo en la página pública? Solo si su precio ACTIVO es > 0.
// Los tipos S/0 (p. ej. "Cortesía") se emiten desde el panel ("Cortesías").
//
// Por qué tampoco en un evento 100% gratis: startCheckout rechaza total 0 (no
// existe flujo de emisión gratis sin código promo), así que ofrecerlos sería un
// callejón sin salida que además deja retener cupo 15 min a cualquiera. Y
// "gratis" inferido por precio es manipulable (desactivar los tipos pagos
// expondría la Cortesía). Habilitar eventos gratis requiere un flag explícito
// de cortesía (migración) + ese flujo de emisión. Ver e2e/REPORT de la Fase 2.
export function isPubliclyOffered(activePriceCents: number): boolean {
  return activePriceCents > 0;
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
    .select('id, event_id, is_active, price_cents')
    .eq('id', ticketTypeId)
    .maybeSingle();
  if (!tt || !tt.is_active) return unavailable;

  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, is_published, archived_at, cancelled_at, starts_at, ends_at')
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
  if (!isPubliclyOffered(activePriceCents)) return unavailable;

  return { ok: true, eventId: event.id, brandId: event.brand_id, activePriceCents };
}
