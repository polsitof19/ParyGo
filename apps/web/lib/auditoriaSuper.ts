import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionUser } from '@/lib/auth';
import type { ModoEscrituraSuper } from '@/lib/impersonation';

// =============================================================
// Auditoría de las escrituras del super admin sobre una marca ajena.
// =============================================================
// Cada vez que el super admin escribe algo que NO es suyo queda una fila en
// events_log con:
//   actor_user_id → quién lo hizo (el super admin, su usuario real)
//   brand_id      → sobre qué marca (on_behalf_of)
//   payload.modo  → 'edicion' (dentro de la marca) o 'cabina' (desde el panel
//                   de plataforma)
//   payload.diff  → qué cambió, con el antes y el después cuando se conoce
//
// Se ve en /cabina-*/salud → "Acciones de super admin".
//
// LÍMITE HONESTO: esto se registra desde la APLICACIÓN, no desde un trigger de
// la base. No se puede hacer en la base porque los paneles escriben con
// service-role y ahí no hay auth.uid(): Postgres no tiene forma de saber QUIÉN
// es el super admin que está actuando. O sea que esta auditoría cubre los
// caminos de la app —que son todos los que existen hoy— pero no sería una red
// contra alguien con la service_role key en la mano. Esa llave es la llave del
// reino y su custodia es otro problema.
//
// Nunca lanza: una auditoría que rompe la acción que audita es peor que una
// auditoría que falta. Si falla, queda en el log del server.
export async function auditarEscrituraSuper(
  admin: SupabaseClient<any, 'public', any>,
  datos: {
    user: SessionUser;
    modo: ModoEscrituraSuper | null;
    brandId: string;
    accion: string;
    eventId?: string | null;
    orderId?: string | null;
    ticketId?: string | null;
    diff?: Record<string, unknown> | null;
  }
): Promise<void> {
  // Sin modo no hubo escritura de super admin: fue el dueño de la marca por su
  // propia membresía, y eso ya se registra donde corresponda.
  if (!datos.modo) return;
  try {
    await admin.from('events_log').insert({
      brand_id: datos.brandId,
      event_id: datos.eventId ?? null,
      order_id: datos.orderId ?? null,
      ticket_id: datos.ticketId ?? null,
      actor_user_id: datos.user.id,
      type: 'super_admin_write',
      payload: {
        accion: datos.accion,
        modo: datos.modo,
        on_behalf_of: datos.brandId,
        acting_email: datos.user.email,
        diff: datos.diff ?? null,
      },
    });
  } catch (e) {
    console.error('[auditarEscrituraSuper] no se pudo registrar', {
      accion: datos.accion,
      brandId: datos.brandId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// Compara dos objetos y devuelve solo lo que cambió, como { campo: [antes, después] }.
// Sirve para que el diff de la auditoría no sea un volcado del formulario entero.
export function diffDeCampos(
  antes: Record<string, unknown> | null | undefined,
  despues: Record<string, unknown>
): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  for (const [k, v] of Object.entries(despues)) {
    const a = antes?.[k];
    // Las fechas llegan de la base como "…+00:00" y del formulario como "…Z":
    // el mismo instante escrito distinto no es un cambio.
    const mismaFecha =
      typeof a === 'string' && typeof v === 'string' &&
      /^\d{4}-\d{2}-\d{2}T/.test(a) && /^\d{4}-\d{2}-\d{2}T/.test(v) &&
      Date.parse(a) === Date.parse(v);
    const igual = a === v || mismaFecha || JSON.stringify(a ?? null) === JSON.stringify(v ?? null);
    if (!igual) out[k] = [a ?? null, v ?? null];
  }
  return out;
}
