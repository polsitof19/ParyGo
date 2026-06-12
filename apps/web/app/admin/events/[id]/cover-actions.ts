'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { uploadEventCover } from '@/lib/brandAssets';

export type CoverState = { ok: boolean; message: string | null };

// Sube/cambia el flyer de un evento. Autoriza al DUEÑO (brand_admin de la marca
// del evento) O al SUPER ADMIN (sobre cualquier marca). El brand_id y el slug del
// path de storage salen del ROW del evento (DB, server-trusted), NUNCA del form,
// y el UPDATE se scopea a ese mismo brand_id. Un brand_admin de otra marca queda
// fuera (su membership no coincide con ev.brand_id). Solo escribe events.cover_url.
export async function setEventCoverAction(
  _prev: CoverState,
  formData: FormData
): Promise<CoverState> {
  const user = await requireSession();

  const eventId = String(formData.get('event_id') ?? '');
  const file = formData.get('cover');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Elegí una imagen.' };

  const admin = createAdminClient();
  const { data: ev } = await admin
    .from('events')
    .select('id, brand_id, brand:brands ( slug )')
    .eq('id', eventId)
    .maybeSingle();
  if (!ev || !ev.brand_id) return { ok: false, message: 'Evento no encontrado.' };

  const authorized =
    user.isSuperAdmin ||
    user.brandMemberships.some((m) => m.brandId === ev.brand_id && m.role === 'brand_admin');
  if (!authorized) return { ok: false, message: 'No tenés permiso sobre este evento.' };

  const brand = Array.isArray(ev.brand) ? ev.brand[0] : ev.brand;
  if (!brand?.slug) return { ok: false, message: 'Marca no encontrada.' };

  const up = await uploadEventCover(admin, brand.slug, file);
  if (!up.ok) return { ok: false, message: up.message };

  const { error } = await admin
    .from('events')
    .update({ cover_url: up.url })
    .eq('id', eventId)
    .eq('brand_id', ev.brand_id); // candado a la marca del row (server-trusted)
  if (error) return { ok: false, message: error.message };

  await admin.from('events_log').insert({
    brand_id: ev.brand_id,
    event_id: eventId,
    actor_user_id: user.id,
    type: 'event_cover_updated',
    payload: { by: user.isSuperAdmin ? 'super_admin' : 'brand_admin' },
  });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/cabina-7k29x/events/${eventId}`);
  return { ok: true, message: 'Flyer actualizado.' };
}
