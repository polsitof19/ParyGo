'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// =============================================================
// Gestión de solicitudes de acceso (TANDA 3, Grupo C) — SOLO super admin
// =============================================================
// El super admin rechaza (o, al aprobar, crea la marca con el alta existente y la
// solicitud queda 'approved' por createBrandWithOwnerAction). Acá solo el rechazo
// y la marca-como-vista; el ALTA no se reescribe.
// =============================================================

export type ReviewState = { ok: boolean; message: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function rejectAccessRequestAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const user = await requireSession({ superAdmin: true });
  const id = String(formData.get('request_id') ?? '');
  if (!UUID_RE.test(id)) return { ok: false, message: 'Solicitud inválida.' };

  const admin = createAdminClient();
  // Solo se rechazan las pendientes (no se pisa una ya aprobada).
  const { error } = await admin
    .from('access_requests')
    .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) return { ok: false, message: error.message };

  revalidatePath('/cabina-7k29x/solicitudes');
  return { ok: true, message: 'Solicitud rechazada.' };
}
