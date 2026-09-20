'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { checkPublicTicketType } from '@/lib/publicTicketGuard';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Client passes a sessionId (sessionStorage uuid). Server uses service_role to
// call the SECURITY DEFINER RPC; anon never reaches the table directly.

export type ReserveResult =
  | { ok: true; expiresAt: string | null }
  // kind 'stock' = no hay cupo suficiente (el cliente arma el mensaje con el
  // nombre del tipo, sin exponer cuántas quedan); 'unavailable' = no se vende.
  | { ok: false; kind: 'stock' | 'unavailable' | 'invalid'; message: string; available?: number };

export async function reserveStock(
  sessionId: string,
  ticketTypeId: string,
  quantity: number
): Promise<ReserveResult> {
  if (!sessionId || sessionId.length < 8) {
    return { ok: false, kind: 'invalid', message: 'Sesión inválida. Recarga la página.' };
  }
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10) {
    return { ok: false, kind: 'invalid', message: 'Cantidad inválida.' };
  }
  if (!UUID_RE.test(ticketTypeId ?? '')) {
    return { ok: false, kind: 'unavailable', message: 'Tipo de entrada no disponible.' };
  }
  const admin = createAdminClient();
  // Esta action es pública: validar ANTES de reservar. Un tipo que no se vende al
  // público (S/0 en evento pago, inactivo, evento no publicado/terminado, marca
  // archivada) no puede retener cupo. Soltar (quantity 0) siempre se permite.
  if (quantity > 0) {
    const check = await checkPublicTicketType(admin, ticketTypeId);
    if (!check.ok) return { ok: false, kind: 'unavailable', message: check.message, available: 0 };
  }
  const { data, error } = await admin.rpc('create_or_refresh_stock_reservation', {
    p_session_id: sessionId,
    p_ticket_type_id: ticketTypeId,
    p_quantity: quantity,
  });
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('insufficient_stock')) {
      const match = msg.match(/available=(\d+)/);
      const available = match ? parseInt(match[1]!, 10) : 0;
      return {
        ok: false,
        kind: 'stock',
        message: 'No quedan suficientes entradas.',
        available,
      };
    }
    console.error('[reserveStock] create_or_refresh_stock_reservation failed', { ticketTypeId, error: msg });
    return { ok: false, kind: 'invalid', message: 'No se pudo reservar. Intenta de nuevo.' };
  }
  return { ok: true, expiresAt: (data as string | null) ?? null };
}

export async function getAvailableStock(ticketTypeId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin.rpc('get_available_stock', {
    p_ticket_type_id: ticketTypeId,
  });
  return typeof data === 'number' ? data : 0;
}
