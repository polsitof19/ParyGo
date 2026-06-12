'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export type EditState = { ok: boolean; message: string | null };

// Autoriza brand_admin del evento; devuelve brand_id o null.
async function authEvent(eventId: string, userId: string, isSuper: boolean, memberships: { brandId: string; role: string }[]) {
  const admin = createAdminClient();
  const { data: ev } = await admin.from('events').select('id, brand_id').eq('id', eventId).maybeSingle();
  if (!ev || !ev.brand_id) return null; // brand_id nulo (huérfano) → rechazar explícito
  const ok = isSuper || memberships.some((m) => m.brandId === ev.brand_id && m.role === 'brand_admin');
  return ok ? (ev.brand_id as string) : null;
}

// Convierte un valor datetime-local (hora de Lima) a UTC ISO. Lima = UTC-5 fijo.
function limaToIso(v: string): string | null {
  const raw = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00-05:00` : v;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const eventSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional().or(z.literal('')),
  starts_at: z.string().min(1),
  venue_name: z.string().max(120).optional().or(z.literal('')),
  venue_address: z.string().max(200).optional().or(z.literal('')),
  min_age: z.string().optional().or(z.literal('')),
});

// ===== 1) Editar campos del evento (libre) =====
export async function updateEventAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const user = await requireSession();
  const eventId = String(formData.get('event_id') ?? '');
  const brandId = await authEvent(eventId, user.id, user.isSuperAdmin, user.brandMemberships);
  if (!brandId) return { ok: false, message: 'No tenés permiso sobre este evento.' };

  const parsed = eventSchema.safeParse({
    name: formData.get('name'), description: formData.get('description') ?? '',
    starts_at: formData.get('starts_at'), venue_name: formData.get('venue_name') ?? '',
    venue_address: formData.get('venue_address') ?? '', min_age: formData.get('min_age') ?? '',
  });
  if (!parsed.success) return { ok: false, message: 'Revisá los campos.' };
  const startsIso = limaToIso(parsed.data.starts_at);
  if (!startsIso) return { ok: false, message: 'Fecha/hora inválida.' };

  const admin = createAdminClient();

  // ===== GUARDA DE FECHA (server-side, no confiar en la UI) =====
  // Borrador: libre. Publicado sin ventas: libre (la UI avisa antes de guardar).
  // Publicado CON ventas: la fecha queda BLOQUEADA (igual que el precio congelado)
  // — la gente compró con esta fecha. Aplica al dueño Y al super admin.
  const { data: current } = await admin
    .from('events')
    .select('starts_at, is_published')
    .eq('id', eventId)
    .maybeSingle();
  const dateChanging = current?.starts_at
    ? new Date(current.starts_at).getTime() !== new Date(startsIso).getTime()
    : true;
  if (dateChanging && current?.is_published) {
    const { count: soldCount } = await admin
      .from('ticket_types')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .gt('sold', 0);
    if ((soldCount ?? 0) > 0) {
      return { ok: false, message: 'No puedes cambiar la fecha: ya hay entradas vendidas con esta fecha.' };
    }
  }

  const { error } = await admin
    .from('events')
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      starts_at: startsIso,
      venue_name: parsed.data.venue_name || null,
      venue_address: parsed.data.venue_address || null,
      min_age: parsed.data.min_age ? Math.min(99, Math.max(0, parseInt(parsed.data.min_age, 10) || 18)) : 18,
    })
    .eq('id', eventId)
    .eq('brand_id', brandId); // scoped
  if (error) return { ok: false, message: error.message };

  await admin.from('events_log').insert({
    brand_id: brandId,
    event_id: eventId,
    actor_user_id: user.id,
    type: dateChanging ? 'event_date_changed' : 'event_edited',
    payload: dateChanging ? { from: current?.starts_at ?? null, to: startsIso } : {},
  });
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/editar`);
  revalidatePath(`/cabina-7k29x/events/${eventId}`);
  return { ok: true, message: 'Evento actualizado.' };
}

// ===== 1.b) Publicar / despublicar el evento (brand_admin de SU evento) =====
// Espeja la lógica ya revisada del panel super admin (setEventPublishedAction en
// cabina-7k29x), pero autorizada por la membership brand_admin del evento. NO
// cambia la semántica de is_published ni RLS: solo agrega un escritor autorizado
// (el dueño de la marca) y scopea el update por brand_id (defensa en profundidad).
export async function setEventPublishedAction(
  eventId: string,
  publish: boolean
): Promise<{ ok: boolean; message?: string }> {
  const user = await requireSession();
  const brandId = await authEvent(eventId, user.id, user.isSuperAdmin, user.brandMemberships);
  if (!brandId) return { ok: false, message: 'No tenés permiso sobre este evento.' };

  const admin = createAdminClient();
  // Guard: no publicar un evento sin al menos un tipo de entrada activo.
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
    .eq('id', eventId)
    .eq('brand_id', brandId); // scoped a la marca del dueño
  if (error) return { ok: false, message: error.message };

  await admin.from('events_log').insert({
    brand_id: brandId, event_id: eventId, actor_user_id: user.id,
    type: publish ? 'event_published' : 'event_unpublished', payload: {},
  });
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath('/admin');
  return { ok: true };
}

// ===== 1.c) Archivar / desarchivar el evento (dueño o super admin) =====
// Archivar = ocultar reversible: lo saca de la home de marca, del checkout y de
// los listados públicos. Archivar implica despublicar (un evento archivado NO
// puede tener venta activa). Desarchivar lo deja en borrador (se re-publica a
// mano). Conserva TODO el historial. Autoriza por brand_id del ROW (authEvent).
export async function setEventArchivedAction(
  eventId: string,
  archived: boolean
): Promise<{ ok: boolean; message?: string }> {
  const user = await requireSession();
  const brandId = await authEvent(eventId, user.id, user.isSuperAdmin, user.brandMemberships);
  if (!brandId) return { ok: false, message: 'No tenés permiso sobre este evento.' };

  const admin = createAdminClient();
  const update = archived
    ? { archived_at: new Date().toISOString(), is_published: false } // archivar = ocultar + dejar de vender
    : { archived_at: null };
  const { error } = await admin.from('events').update(update).eq('id', eventId).eq('brand_id', brandId);
  if (error) return { ok: false, message: error.message };

  await admin.from('events_log').insert({
    brand_id: brandId, event_id: eventId, actor_user_id: user.id,
    type: archived ? 'event_archived' : 'event_unarchived', payload: {},
  });
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath('/admin');
  revalidatePath(`/cabina-7k29x/events/${eventId}`);
  return { ok: true };
}

// ===== 1.d) Borrado PERMANENTE — solo eventos VACÍOS (sin historial) =====
// Solo se permite si el evento NO tiene órdenes NI tickets. Cualquier cosa con
// historial NO se borra (la DB además lo bloquea por RESTRICT): hay que archivar.
// Confirmación por nombre (defensa contra borrados accidentales). Limpia el flyer
// del storage. Cascada DB: ticket_types, fases, promo_codes/redemptions.
export async function deleteEventAction(
  eventId: string,
  confirmName: string
): Promise<{ ok: boolean; message?: string }> {
  const user = await requireSession();
  const brandId = await authEvent(eventId, user.id, user.isSuperAdmin, user.brandMemberships);
  if (!brandId) return { ok: false, message: 'No tenés permiso sobre este evento.' };

  const admin = createAdminClient();
  const { data: ev } = await admin
    .from('events')
    .select('id, name, cover_url')
    .eq('id', eventId)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (!ev) return { ok: false, message: 'Evento no encontrado.' };
  if ((confirmName ?? '').trim() !== ev.name) {
    return { ok: false, message: 'El nombre no coincide. Escribilo igual para confirmar.' };
  }

  // Guard de historial: 0 órdenes Y 0 tickets, o se rechaza (archivá en su lugar).
  const [{ count: orders }, { count: tickets }] = await Promise.all([
    admin.from('orders').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    admin.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
  ]);
  if ((orders ?? 0) > 0 || (tickets ?? 0) > 0) {
    return { ok: false, message: 'No se puede eliminar: tiene ventas. Archivá en su lugar.' };
  }

  // Log ANTES de borrar (events_log.event_id queda SET NULL al borrar el evento).
  await admin.from('events_log').insert({
    brand_id: brandId, event_id: eventId, actor_user_id: user.id,
    type: 'event_deleted', payload: { name: ev.name },
  });

  const { error } = await admin.from('events').delete().eq('id', eventId).eq('brand_id', brandId);
  if (error) return { ok: false, message: error.message };

  // Limpiar el flyer huérfano del storage (best-effort).
  if (ev.cover_url) {
    const path = ev.cover_url.split('/brand-assets/')[1];
    if (path) await admin.storage.from('brand-assets').remove([path]);
  }

  revalidatePath('/admin');
  revalidatePath('/cabina-7k29x/events');
  return { ok: true };
}

// ===== 2) Editar un tipo de entrada (con la REGLA SEGURA) =====
// sin ventas → libre; con ventas → NO bajar capacidad debajo de lo vendido, NO
// cambiar precio (congelado en order_items). Subir capacidad: sí. Precio: solo si
// el tipo NO tiene fases de preventa (>1 fase) — no tocamos la lógica de fases.
export async function updateTicketTypeAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const user = await requireSession();
  const ttId = String(formData.get('ticket_type_id') ?? '');
  const eventId = String(formData.get('event_id') ?? '');
  const brandId = await authEvent(eventId, user.id, user.isSuperAdmin, user.brandMemberships);
  if (!brandId) return { ok: false, message: 'No tenés permiso.' };

  const admin = createAdminClient();
  const { data: tt } = await admin
    .from('ticket_types')
    .select('id, event_id, name, price_cents, capacity, sold, is_unlimited, is_active')
    .eq('id', ttId)
    .maybeSingle();
  if (!tt || tt.event_id !== eventId) return { ok: false, message: 'Ese tipo no es de este evento.' };

  const name = String(formData.get('name') ?? '').trim().slice(0, 80) || tt.name;
  const isActive = formData.get('is_active') === 'on';
  const isUnlimited = formData.get('is_unlimited') === 'on';
  const newPriceCents = Math.round(parseFloat(String(formData.get('price_soles') ?? '')) * 100);
  const newCapacity = parseInt(String(formData.get('capacity') ?? ''), 10);
  const sold = tt.sold ?? 0;

  const update: Record<string, unknown> = { name, is_active: isActive };

  // --- Capacidad / ilimitado ---
  if (isUnlimited) {
    update.is_unlimited = true;
  } else {
    if (!Number.isFinite(newCapacity) || newCapacity < 1) return { ok: false, message: 'Capacidad inválida.' };
    if (newCapacity < sold) return { ok: false, message: `No podés bajar la capacidad por debajo de lo vendido (${sold}).` };
    update.is_unlimited = false;
    update.capacity = newCapacity;
  }

  // --- Precio: con ventas, congelado; sin ventas, editable salvo preventa ---
  if (Number.isFinite(newPriceCents) && newPriceCents !== tt.price_cents) {
    if (sold > 0) {
      return { ok: false, message: 'No se puede cambiar el precio de un tipo que ya tiene ventas (el precio queda congelado para quienes ya compraron).' };
    }
    if (newPriceCents < 0) return { ok: false, message: 'Precio inválido.' };
    const { count: phaseCount } = await admin
      .from('ticket_type_price_phases')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_type_id', ttId);
    if ((phaseCount ?? 0) > 1) {
      return { ok: false, message: 'Este tipo tiene fases de preventa; el precio se gestiona por fases (no editable acá).' };
    }
    update.price_cents = newPriceCents;
    // Si hay UNA fase base (sin ventas), la alineamos para que el precio activo coincida.
    if ((phaseCount ?? 0) === 1) {
      await admin.from('ticket_type_price_phases').update({ price_cents: newPriceCents }).eq('ticket_type_id', ttId);
    }
  }

  const { error } = await admin.from('ticket_types').update(update).eq('id', ttId).eq('event_id', eventId);
  if (error) return { ok: false, message: error.message };

  await admin.from('events_log').insert({ brand_id: brandId, event_id: eventId, actor_user_id: user.id, type: 'ticket_type_edited', payload: { ticket_type_id: ttId } });
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/editar`);
  return { ok: true, message: `"${name}" actualizado.` };
}

// ===== 3) Crear un tipo de entrada nuevo (libre) =====
export async function createTicketTypeAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const user = await requireSession();
  const eventId = String(formData.get('event_id') ?? '');
  const brandId = await authEvent(eventId, user.id, user.isSuperAdmin, user.brandMemberships);
  if (!brandId) return { ok: false, message: 'No tenés permiso.' };

  const name = String(formData.get('name') ?? '').trim().slice(0, 80);
  if (name.length < 1) return { ok: false, message: 'Poné un nombre.' };
  const isUnlimited = formData.get('is_unlimited') === 'on';
  const priceCents = Math.round(parseFloat(String(formData.get('price_soles') ?? '')) * 100);
  if (!Number.isFinite(priceCents) || priceCents < 0) return { ok: false, message: 'Precio inválido.' };
  const capacity = isUnlimited ? 0 : parseInt(String(formData.get('capacity') ?? ''), 10);
  if (!isUnlimited && (!Number.isFinite(capacity) || capacity < 1)) return { ok: false, message: 'Capacidad inválida.' };

  const admin = createAdminClient();
  const { data: maxRow } = await admin.from('ticket_types').select('sort_order').eq('event_id', eventId).order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const sortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: created, error } = await admin
    .from('ticket_types')
    .insert({ event_id: eventId, name, price_cents: priceCents, capacity, is_unlimited: isUnlimited, is_active: true, sort_order: sortOrder, sold: 0, reserved: 0, max_scans: 1 })
    .select('id')
    .single();
  if (error || !created) return { ok: false, message: error?.message ?? 'No se pudo crear el tipo.' };

  // Fase base (todo el período) para que el precio activo se resuelva como los demás.
  await admin.from('ticket_type_price_phases').insert({ ticket_type_id: created.id, name: 'Base', price_cents: priceCents, starts_at: null, ends_at: null, sort_order: 0 });

  await admin.from('events_log').insert({ brand_id: brandId, event_id: eventId, actor_user_id: user.id, type: 'ticket_type_created', payload: { ticket_type_id: created.id, name } });
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/editar`);
  return { ok: true, message: `"${name}" creado.` };
}
