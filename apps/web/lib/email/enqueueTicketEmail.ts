import type { SupabaseClient } from '@supabase/supabase-js';

// Encola la entrada por email en vez de mandarla en el camino del comprador.
//
// Por qué: el QR ya está en pantalla y en /t/<uuid> cuando esto se llama. El
// email es la COPIA, no la entrada. Hacer esperar a alguien —y arriesgar que el
// reclamo falle— por un servicio de terceros con límite de envíos por segundo
// es poner lo accesorio delante de lo importante.
//
// La cola (notification_jobs) ya trae claim atómico (FOR UPDATE SKIP LOCKED),
// reintentos con tope de 5 y visibilidad en /cabina-*/salud. El worker vive en
// app/api/cron/notifications.
//
// Nunca lanza: si encolar falla, se registra y el reclamo sigue. El comprador
// tiene su QR igual y puede pedir el reenvío desde su entrada.
export async function enqueueTicketEmail(
  admin: SupabaseClient<any, 'public', any>,
  orderId: string,
  // Un REENVÍO necesita su propia clave: con la de la compra chocaba contra el
  // job ya 'sent', el 23505 se tomaba como éxito y no salía ningún correo.
  dedupeKey = `ticket_email:${orderId}`
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { data: order, error } = await admin
      .from('orders')
      .select('id, brand_id, event_id, buyer_name, buyer_email')
      .eq('id', orderId)
      .maybeSingle();
    if (error || !order) return { ok: false, reason: error?.message ?? 'order_not_found' };
    if (!order.buyer_email) return { ok: false, reason: 'no_buyer_email' };

    // dedupe_key es UNIQUE: si el mismo pedido se encola dos veces (reintento
    // del checkout, doble clic), la segunda no crea otro job ni manda otro mail.
    const { error: insErr } = await admin.from('notification_jobs').insert({
      kind: 'ticket_email',
      brand_id: order.brand_id,
      event_id: order.event_id,
      order_id: order.id,
      recipient_email: order.buyer_email,
      recipient_name: order.buyer_name ?? '',
      dedupe_key: dedupeKey,
      payload: {},
      status: 'pending',
    });
    // 23505 = duplicado: ya estaba encolado. Es el resultado deseado.
    if (insErr && insErr.code !== '23505') return { ok: false, reason: insErr.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'unknown' };
  }
}
