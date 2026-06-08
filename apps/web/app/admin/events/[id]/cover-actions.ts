'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { uploadEventCover } from '@/lib/brandAssets';

export type CoverState = { ok: boolean; message: string | null };

// El dueño sube/cambia el flyer de UNO de SUS eventos. El evento debe pertenecer
// a la marca de la sesión (nunca del form). Solo escribe events.cover_url; no
// toca nada del flujo de creación/venta.
export async function setEventCoverAction(
  _prev: CoverState,
  formData: FormData
): Promise<CoverState> {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) return { ok: false, message: 'No autorizado.' };

  const eventId = String(formData.get('event_id') ?? '');
  const file = formData.get('cover');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Elegí una imagen.' };

  const admin = createAdminClient();
  const { data: ev } = await admin
    .from('events')
    .select('id, brand_id, brand:brands ( slug )')
    .eq('id', eventId)
    .maybeSingle();
  if (!ev || ev.brand_id !== membership.brandId) {
    return { ok: false, message: 'Ese evento no es de tu marca.' };
  }
  const brand = Array.isArray(ev.brand) ? ev.brand[0] : ev.brand;
  if (!brand?.slug) return { ok: false, message: 'Marca no encontrada.' };

  const up = await uploadEventCover(admin, brand.slug, file);
  if (!up.ok) return { ok: false, message: up.message };

  const { error } = await admin
    .from('events')
    .update({ cover_url: up.url })
    .eq('id', eventId)
    .eq('brand_id', membership.brandId); // doble candado a la marca de la sesión
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/admin/events/${eventId}`);
  return { ok: true, message: 'Flyer actualizado. Ya se ve en tu evento.' };
}
