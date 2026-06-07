'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { solesToCents } from '@/lib/utils';

type TicketTypeRow = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  capacity: number;
  sold: number;
  sort_order: number;
  color_hex: string | null;
  is_active: boolean;
};

type UpsertResult =
  | { ok: true; message: string; ticketType: TicketTypeRow }
  | { ok: false; message: string };

const upsertSchema = z.object({
  id: z.string().uuid().optional().or(z.literal('')),
  event_id: z.string().uuid(),
  name: z.string().min(1).max(60),
  price_soles: z.string().min(1),
  capacity: z.string().min(1),
  sort_order: z.string().optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
  color_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .or(z.literal('')),
  is_active: z.string().optional().or(z.literal('')),
});

export async function upsertTicketTypeAction(formData: FormData): Promise<UpsertResult> {
  await requireSession({ superAdmin: true });

  const parsed = upsertSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { ok: false, message: first ? `${first.path.join('.')}: ${first.message}` : 'Datos inválidos' };
  }

  const priceCents = solesToCents(parsed.data.price_soles);
  const capacity = parseInt(parsed.data.capacity, 10);
  if (!Number.isFinite(capacity) || capacity < 0) {
    return { ok: false, message: 'Capacidad inválida' };
  }
  const sortOrder = parsed.data.sort_order ? parseInt(parsed.data.sort_order, 10) : 0;

  const admin = createAdminClient();

  const payload = {
    event_id: parsed.data.event_id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    price_cents: priceCents,
    capacity,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    color_hex: parsed.data.color_hex || null,
    is_active: parsed.data.is_active === '1',
  };

  if (parsed.data.id) {
    // Update
    const { data, error } = await admin
      .from('ticket_types')
      .update(payload)
      .eq('id', parsed.data.id)
      .select('id, name, description, price_cents, capacity, sold, sort_order, color_hex, is_active')
      .single();
    if (error || !data) return { ok: false, message: error?.message ?? 'No se pudo actualizar' };
    revalidatePath(`/cabina-7k29x/events/${parsed.data.event_id}`);
    return { ok: true, message: 'Tipo actualizado', ticketType: data as TicketTypeRow };
  } else {
    // Insert
    const { data, error } = await admin
      .from('ticket_types')
      .insert(payload)
      .select('id, name, description, price_cents, capacity, sold, sort_order, color_hex, is_active')
      .single();
    if (error || !data) return { ok: false, message: error?.message ?? 'No se pudo crear' };
    revalidatePath(`/cabina-7k29x/events/${parsed.data.event_id}`);
    return { ok: true, message: 'Tipo creado', ticketType: data as TicketTypeRow };
  }
}

export async function deleteTicketTypeAction(
  id: string
): Promise<{ ok: boolean; message?: string }> {
  await requireSession({ superAdmin: true });
  const admin = createAdminClient();

  // Block deletion if there are sold tickets — the trigger sold counter must be 0.
  const { data: tt } = await admin
    .from('ticket_types')
    .select('event_id, sold')
    .eq('id', id)
    .single();
  if (!tt) return { ok: false, message: 'No encontrado' };
  if ((tt.sold ?? 0) > 0) {
    return { ok: false, message: 'No se puede borrar: ya tiene ventas. Desactivá en su lugar.' };
  }

  const { error } = await admin.from('ticket_types').delete().eq('id', id);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/cabina-7k29x/events/${tt.event_id}`);
  return { ok: true };
}

export async function setEventPublishedAction(
  eventId: string,
  publish: boolean
): Promise<{ ok: boolean; message?: string }> {
  await requireSession({ superAdmin: true });
  const admin = createAdminClient();

  // Guard: don't publish events without active ticket types.
  if (publish) {
    const { count } = await admin
      .from('ticket_types')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('is_active', true);
    if (!count || count === 0) {
      return { ok: false, message: 'Agregá al menos un tipo de entrada activo antes de publicar.' };
    }
  }

  const { error } = await admin
    .from('events')
    .update({ is_published: publish })
    .eq('id', eventId);
  if (error) return { ok: false, message: error.message };

  await admin.from('events_log').insert({
    event_id: eventId,
    type: publish ? 'event_published' : 'event_unpublished',
    payload: {},
  });

  revalidatePath(`/cabina-7k29x/events/${eventId}`);
  revalidatePath('/cabina-7k29x/events');
  return { ok: true };
}
