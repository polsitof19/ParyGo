'use server';

import { createAdminClient } from '@/lib/supabase/admin';

// Client passes a sessionId (sessionStorage uuid). Server uses service_role to
// call the SECURITY DEFINER RPC; anon never reaches the table directly.

export type ReserveResult =
  | { ok: true; expiresAt: string | null }
  | { ok: false; message: string; available?: number };

export async function reserveStock(
  sessionId: string,
  ticketTypeId: string,
  quantity: number
): Promise<ReserveResult> {
  if (!sessionId || sessionId.length < 8) {
    return { ok: false, message: 'Sesión inválida.' };
  }
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10) {
    return { ok: false, message: 'Cantidad inválida.' };
  }
  const admin = createAdminClient();
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
        message: `Solo quedan ${available} disponibles.`,
        available,
      };
    }
    return { ok: false, message: msg || 'No se pudo reservar.' };
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
