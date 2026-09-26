'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession, type SessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { limaToIso, shiftEnd, validateEventWindow, validateTicketTypePricing } from '@/lib/eventValidation';
import { eventOverAt, isPubliclyOffered } from '@/lib/publicTicketGuard';
import { generarToken, tokensPrivados, parseMaxPorPersona } from '@/lib/privateAccess';
import { puedeEscribirComoSuper, type ModoEscrituraSuper } from '@/lib/impersonation';
import { auditarEscrituraSuper, diffDeCampos } from '@/lib/auditoriaSuper';
import { formatEventDate } from '@/lib/utils';
import { mensajePrueba } from '@/lib/prueba';
import { textosPanel, idiomaPanel } from '@/lib/idiomaServer';

export type EditState = { ok: boolean; message: string | null };

// Autoriza sobre un evento y dice POR QUÉ CAMINO se autorizó:
//   modo null      → es el dueño de la marca, por su membresía;
//   modo 'cabina'  → super admin desde el panel de plataforma;
//   modo 'edicion' → super admin DENTRO de la marca, con el modo edición
//                    encendido (queda auditado).
// El super admin que está viendo la marca SIN modo edición no pasa: esa es la
// diferencia entre mirar y tocar.
async function authEvent(eventId: string, user: SessionUser) {
  const admin = createAdminClient();
  const { data: ev } = await admin.from('events').select('id, brand_id').eq('id', eventId).maybeSingle();
  if (!ev || !ev.brand_id) return null; // brand_id nulo (huérfano) → rechazar explícito
  const brandId = ev.brand_id as string;
  const esDuenio = user.brandMemberships.some((m) => m.brandId === brandId && m.role === 'brand_admin');
  if (esDuenio) return { brandId, modo: null as ModoEscrituraSuper | null };
  const modo = puedeEscribirComoSuper(user, brandId);
  return modo ? { brandId, modo } : null;
}

// limaToIso (datetime-local en hora de Lima → UTC ISO) vive en lib/eventValidation,
// compartido con la creación de eventos.

const eventSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional().or(z.literal('')),
  starts_at: z.string().min(1),
  venue_name: z.string().max(120).optional().or(z.literal('')),
  venue_address: z.string().max(200).optional().or(z.literal('')),
  // Enlace de Google Maps: debe ser https (va a un href). Vacío permitido.
  venue_maps_url: z.string().url().startsWith('https://').max(500).optional().or(z.literal('')),
  min_age: z.string().optional().or(z.literal('')),
  // Límite de entradas por persona (0060). Vacío = sin límite.
  max_per_person: z.string().optional().or(z.literal('')),
});

// ===== 1) Editar campos del evento (libre) =====
export async function updateEventAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const user = await requireSession();
  const { t } = await textosPanel();
  const eventId = String(formData.get('event_id') ?? '');
  const auth = await authEvent(eventId, user);
  const brandId = auth?.brandId ?? null;
  if (!brandId) return { ok: false, message: t('No tienes permiso sobre este evento.', 'You do not have permission over this event.') };

  const parsed = eventSchema.safeParse({
    name: formData.get('name'), description: formData.get('description') ?? '',
    starts_at: formData.get('starts_at'), venue_name: formData.get('venue_name') ?? '',
    venue_address: formData.get('venue_address') ?? '', venue_maps_url: formData.get('venue_maps_url') ?? '',
    min_age: formData.get('min_age') ?? '',
    max_per_person: formData.get('max_per_person') ?? '',
  });
  if (!parsed.success) return { ok: false, message: t('Revisa los campos (el enlace de Maps debe empezar con https://).', 'Check the fields (the Maps link must start with https://).') };
  const requireAge = formData.get('require_age_confirmation') === 'on';
  const requireDni = formData.get('require_dni') === 'on';
  const sendReminder = formData.get('send_reminder') === 'on';
  const collectAttendeeNames = formData.get('collect_attendee_names') === 'on';
  const allowTransfer = formData.get('allow_transfer') === 'on';
  const startsIso = limaToIso(parsed.data.starts_at);
  if (!startsIso) return { ok: false, message: t('Fecha/hora inválida.', 'Invalid date/time.') };

  const admin = createAdminClient();

  // ===== GUARDA DE FECHA (server-side, no confiar en la UI) =====
  // Borrador: libre. Publicado sin ventas: libre (la UI avisa antes de guardar).
  // Publicado CON ventas: la fecha queda BLOQUEADA (igual que el precio congelado)
  // — la gente compró con esta fecha. Aplica al dueño Y al super admin.
  const { data: current } = await admin
    .from('events')
    .select('starts_at, ends_at, is_published, is_free, name')
    .eq('id', eventId)
    .maybeSingle();
  const dateChanging = current?.starts_at
    ? new Date(current.starts_at).getTime() !== new Date(startsIso).getTime()
    : true;
  // Si cambia el inicio: no puede quedar en el pasado, y el fin se corre con el
  // mismo delta (sin esto ends_at quedaba antes del inicio → evento "terminado").
  const endsIso = dateChanging && current?.starts_at
    ? shiftEnd(current.starts_at, startsIso, current.ends_at ?? null)
    : current?.ends_at ?? null;
  if (dateChanging) {
    const windowErr = validateEventWindow({ startsIso, endsIso, requireFutureStart: true }, await idiomaPanel());
    if (windowErr) return { ok: false, message: windowErr.message };
  }
  if (dateChanging && current?.is_published) {
    const { count: soldCount } = await admin
      .from('ticket_types')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .gt('sold', 0);
    if ((soldCount ?? 0) > 0) {
      return { ok: false, message: t('No puedes cambiar la fecha: ya hay entradas vendidas con esta fecha.', 'You cannot change the date: there are already tickets sold with this date.') };
    }
  }

  // Marcar gratis un evento que YA cobró dejaría la página pública diciendo
  // "Gratis" sobre un evento con ventas pagas. El checkbox del formulario ya
  // viene deshabilitado en ese caso, pero eso es del cliente: la decisión la
  // toma el server. Solo se bloquea el CAMBIO — si ya estaba marcado, guardar
  // el resto del formulario no falla.
  //
  // OJO (2026-09-25, Code no podía guardar "Datos del evento"): con ventas la
  // casilla viaja DESHABILITADA y un checkbox deshabilitado NO se manda en el
  // FormData, así que acá llegaba "no marcado" para un evento gratis y se
  // rechazaba TODO el guardado (nombre incluido). Con ventas pagas la casilla
  // no se puede cambiar: se conserva lo que hay y no se mira el formulario.
  let isFree = formData.get('is_free') === 'on';
  if (isFree !== (current?.is_free ?? false)) {
    const { count: pagas } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'paid');
    if ((pagas ?? 0) > 0) {
      if (formData.has('is_free') || !current?.is_free) {
        return { ok: false, message: t('No puedes cambiar si el evento es gratis: ya tiene ventas pagas.', 'You cannot change whether the event is free: it already has paid sales.') };
      }
      isFree = current.is_free;
    }
  }

  const { error } = await admin
    .from('events')
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      starts_at: startsIso,
      ends_at: endsIso,
      venue_name: parsed.data.venue_name || null,
      venue_address: parsed.data.venue_address || null,
      venue_maps_url: parsed.data.venue_maps_url || null,
      require_age_confirmation: requireAge,
      require_dni: requireDni,
      is_free: isFree,
      send_reminder: sendReminder,
      collect_attendee_names: collectAttendeeNames,
      allow_transfer: allowTransfer,
      min_age: parsed.data.min_age ? Math.min(99, Math.max(0, parseInt(parsed.data.min_age, 10) || 18)) : 18,
      // Vacío o 0 = sin límite (NULL). El tope duro (1..100) lo impone también
      // el CHECK de la 0060: esto es la cara amable, no la garantía.
      max_per_person: (() => {
        const n = parseInt(String(parsed.data.max_per_person ?? ''), 10);
        return Number.isFinite(n) && n > 0 ? Math.min(100, n) : null;
      })(),
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
  // Auditoría de super admin: además del registro de dominio de arriba, queda
  // firmado QUIÉN lo hizo y sobre qué marca (solo si actuó como super admin).
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId, accion: dateChanging ? 'event_date_changed' : 'event_edited', diff: diffDeCampos(current ?? null, { starts_at: startsIso, ends_at: endsIso, is_free: isFree, name: parsed.data.name }) });
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/editar`);
  revalidatePath(`/cabina-7k29x/events/${eventId}`);
  return { ok: true, message: t('Evento actualizado.', 'Event updated.') };
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
  const { t } = await textosPanel();
  const auth = await authEvent(eventId, user);
  const brandId = auth?.brandId ?? null;
  if (!brandId) return { ok: false, message: t('No tienes permiso sobre este evento.', 'You do not have permission over this event.') };

  const admin = createAdminClient();
  // Guard: no publicar un evento sin al menos un tipo de entrada activo.
  if (publish) {
    const { count } = await admin
      .from('ticket_types')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('is_active', true);
    if (!count || count === 0) {
      return { ok: false, message: t('Agrega al menos un tipo de entrada activo antes de publicar.', 'Add at least one active ticket type before publishing.') };
    }
    // Guard: no publicar un evento que ya terminó (nadie podría comprar).
    const { data: ev } = await admin.from('events').select('starts_at, ends_at').eq('id', eventId).eq('brand_id', brandId).maybeSingle();
    if (ev && eventOverAt(ev.starts_at, ev.ends_at) < Date.now()) {
      return { ok: false, message: t('Este evento ya terminó. Cambia la fecha antes de publicarlo.', 'This event has already ended. Change the date before publishing it.') };
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
  // Auditoría de super admin: además del registro de dominio de arriba, queda
  // firmado QUIÉN lo hizo y sobre qué marca (solo si actuó como super admin).
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId, accion: publish ? 'event_published' : 'event_unpublished', diff: { is_published: publish } });
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath('/admin');
  return { ok: true };
}

// ===== 1.b2) POSTERGAR el evento (mover la fecha CON ventas, avisando) =====
// A diferencia de updateEventAction (que bloquea cambiar la fecha en silencio si
// hay ventas), postergar es un acto DELIBERADO: permite mover starts_at aunque
// haya ventas, NO toca tickets ni órdenes (siguen válidos), y avisa por email a
// cada comprador con entradas válidas. Autoriza por brand_id del ROW (authEvent,
// que ya deniega super-admin durante impersonación). Email best-effort por
// destinatario (uno por comprador; nunca se expone la lista).
export async function postponeEventAction(
  eventId: string,
  newStartsAtLima: string
): Promise<{ ok: boolean; message?: string; queued?: number }> {
  const user = await requireSession();
  const { t } = await textosPanel();
  const auth = await authEvent(eventId, user);
  const brandId = auth?.brandId ?? null;
  if (!brandId) return { ok: false, message: t('No tienes permiso sobre este evento.', 'You do not have permission over this event.') };

  const startsIso = limaToIso(newStartsAtLima);
  if (!startsIso) return { ok: false, message: t('Fecha/hora inválida.', 'Invalid date/time.') };

  const admin = createAdminClient();
  const { data: ev } = await admin
    .from('events')
    .select('id, name, starts_at, ends_at, venue_name')
    .eq('id', eventId)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (!ev) return { ok: false, message: t('Evento no encontrado.', 'Event not found.') };

  const oldStartsAt = ev.starts_at as string;
  if (new Date(oldStartsAt).getTime() === new Date(startsIso).getTime()) {
    return { ok: false, message: t('Esa es la misma fecha. Elige una distinta.', 'That is the same date. Choose a different one.') };
  }
  // Postergar = mover a una fecha FUTURA conservando la duración: el fin se corre
  // con el mismo delta (antes quedaba ends_at < starts_at → "terminado", sin venta).
  const endsIso = shiftEnd(oldStartsAt, startsIso, (ev.ends_at as string | null) ?? null);
  const windowErr = validateEventWindow({ startsIso, endsIso, requireFutureStart: true }, await idiomaPanel());
  if (windowErr) return { ok: false, message: windowErr.message };

  // Mover la fecha. NO se tocan tickets ni órdenes.
  const { error: updErr } = await admin
    .from('events')
    .update({ starts_at: startsIso, ends_at: endsIso })
    .eq('id', eventId)
    .eq('brand_id', brandId);
  if (updErr) return { ok: false, message: updErr.message };

  await admin.from('events_log').insert({
    brand_id: brandId, event_id: eventId, actor_user_id: user.id,
    type: 'event_postponed', payload: { from: oldStartsAt, to: startsIso },
  });
  // Auditoría de super admin: además del registro de dominio de arriba, queda
  // firmado QUIÉN lo hizo y sobre qué marca (solo si actuó como super admin).
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId: eventId, accion: 'event_postponed', diff: { from: oldStartsAt, to: startsIso } });

  // ENCOLAR los avisos (NO enviarlos en el request). El worker (pg_cron →
  // /api/cron/postpone-emails) los entrega en tandas, con idempotencia por
  // destinatario y reintentos. La RPC deriva la lista de compradores con
  // entradas válidas server-side → nunca sale del DB hacia la app. Responde rápido
  // aunque haya miles de compradores (sin loop secuencial ni timeout del Edge).
  let queued = 0;
  const { data: enq } = await admin.rpc('enqueue_event_postpone_emails', {
    p_event_id: eventId,
    p_brand_id: brandId,
    p_event_name: ev.name as string,
    p_old_label: formatEventDate(oldStartsAt),
    p_new_label: formatEventDate(startsIso),
    p_venue: (ev.venue_name as string | null) ?? '',
    p_new_iso: startsIso,
  });
  queued = typeof enq === 'number' ? enq : 0;

  await admin.from('events_log').insert({
    brand_id: brandId, event_id: eventId, actor_user_id: user.id,
    type: 'event_postponed_notified', payload: { queued },
  });
  // Auditoría de super admin: además del registro de dominio de arriba, queda
  // firmado QUIÉN lo hizo y sobre qué marca (solo si actuó como super admin).
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId: eventId, accion: 'event_postponed_notified', diff: { queued } });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/editar`);
  revalidatePath(`/cabina-7k29x/events/${eventId}`);
  return { ok: true, queued };
}

// ===== 1.b3) CANCELAR el evento (despublica + avisa por email) =====
// Acto DELIBERADO e irreversible en la práctica: marca el evento cancelado
// (cancelled_at), lo despublica (deja de venderse y desaparece del público) y
// encola un aviso por email a cada comprador con entradas válidas. NO toca
// tickets ni dinero (los reembolsos los maneja el organizador por fuera).
// Autoriza por brand_id del ROW (authEvent → deniega super-admin impersonando).
export async function cancelEventAction(
  eventId: string,
  reason: string
): Promise<{ ok: boolean; message?: string; queued?: number }> {
  const user = await requireSession();
  const { t } = await textosPanel();
  const auth = await authEvent(eventId, user);
  const brandId = auth?.brandId ?? null;
  if (!brandId) return { ok: false, message: t('No tienes permiso sobre este evento.', 'You do not have permission over this event.') };

  const cleanReason = (reason ?? '').trim().slice(0, 500);

  const admin = createAdminClient();
  const { data: ev } = await admin
    .from('events')
    .select('id, name, starts_at, cancelled_at')
    .eq('id', eventId)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (!ev) return { ok: false, message: t('Evento no encontrado.', 'Event not found.') };
  if (ev.cancelled_at) return { ok: false, message: t('Este evento ya está cancelado.', 'This event is already cancelled.') };

  // Marcar cancelado + despublicar (deja de venderse y sale del público).
  const { error: updErr } = await admin
    .from('events')
    .update({ cancelled_at: new Date().toISOString(), cancellation_reason: cleanReason || null, is_published: false })
    .eq('id', eventId)
    .eq('brand_id', brandId);
  if (updErr) return { ok: false, message: updErr.message };

  await admin.from('events_log').insert({
    brand_id: brandId, event_id: eventId, actor_user_id: user.id,
    type: 'event_cancelled', payload: { reason: cleanReason || null },
  });
  // Auditoría de super admin: además del registro de dominio de arriba, queda
  // firmado QUIÉN lo hizo y sobre qué marca (solo si actuó como super admin).
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId: eventId, accion: 'event_cancelled', diff: { reason: cleanReason || null } });

  // ENCOLAR el aviso (uno por comprador con entrada válida). El worker
  // (/api/cron/notifications) lo entrega en tandas, idempotente por destinatario.
  let queued = 0;
  const { data: enq } = await admin.rpc('enqueue_event_cancellation', {
    p_event_id: eventId,
    p_brand_id: brandId,
    p_event_name: ev.name as string,
    p_starts_iso: ev.starts_at as string,
    p_reason: cleanReason,
  });
  queued = typeof enq === 'number' ? enq : 0;

  await admin.from('events_log').insert({
    brand_id: brandId, event_id: eventId, actor_user_id: user.id,
    type: 'event_cancelled_notified', payload: { queued },
  });
  // Auditoría de super admin: además del registro de dominio de arriba, queda
  // firmado QUIÉN lo hizo y sobre qué marca (solo si actuó como super admin).
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId: eventId, accion: 'event_cancelled_notified', diff: { queued } });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/editar`);
  revalidatePath(`/cabina-7k29x/events/${eventId}`);
  return { ok: true, queued };
}

// ===== 1.b-bis) Clonar evento (dueño o super admin) =====
// Crea un BORRADOR nuevo a partir de un evento existente: copia datos + tipos de
// entrada + fases de precio. Reusa create_brand_event (mismo RPC del alta), así
// que consume 1 saldo y NO toca el evento original ni sus ventas. is_published
// queda false (lo publica el dueño cuando quiera). Autoriza por authEvent
// (denegado en impersonación: el super admin viendo NO crea eventos).
export async function cloneEventAction(eventId: string): Promise<{ ok: boolean; message?: string }> {
  const user = await requireSession();
  const { t } = await textosPanel();
  const auth = await authEvent(eventId, user);
  const brandId = auth?.brandId ?? null;
  if (!brandId) return { ok: false, message: t('No tienes permiso sobre este evento.', 'You do not have permission over this event.') };

  const admin = createAdminClient();
  const { data: ev } = await admin
    .from('events')
    .select('slug, name, description, starts_at, ends_at, venue_name, venue_address, venue_maps_url, venue_lat, venue_lng, cover_url, cover_w, cover_h, min_age, refund_policy')
    .eq('id', eventId)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (!ev) return { ok: false, message: t('Evento no encontrado.', 'Event not found.') };
  // El clon copia fechas y fases del original y gasta 1 de saldo: validar ANTES
  // del RPC. Un evento que ya pasó (o con fin antes del inicio) no se clona.
  const cloneWindowErr = validateEventWindow({ startsIso: ev.starts_at, endsIso: ev.ends_at, requireFutureStart: true }, await idiomaPanel());
  if (cloneWindowErr) {
    return {
      ok: false,
      message: cloneWindowErr.field === 'starts_at'
        ? t('Este evento ya pasó: el clon copiaría fechas y fases vencidas (y gastaría 1 de saldo). Crea uno nuevo desde "Crear evento".', 'This event has already passed: the clone would copy expired dates and phases (and spend 1 from your balance). Create a new one from "Create event".')
        : cloneWindowErr.message,
    };
  }

  const { data: types } = await admin
    .from('ticket_types')
    .select('id, name, price_cents, capacity, is_unlimited, sort_order')
    .eq('event_id', eventId)
    .order('sort_order');
  if (!types || types.length === 0) return { ok: false, message: t('El evento no tiene tipos de entrada para clonar.', 'The event has no ticket types to clone.') };

  const typeIds = types.map((t) => t.id);
  const { data: phases } = await admin
    .from('ticket_type_price_phases')
    .select('ticket_type_id, price_cents, starts_at, ends_at, sort_order')
    .in('ticket_type_id', typeIds);
  const phasesByType = new Map<string, { price_cents: number; starts_at: string | null; ends_at: string | null; sort_order: number }[]>();
  for (const p of phases ?? []) {
    const arr = phasesByType.get(p.ticket_type_id) ?? [];
    arr.push({ price_cents: p.price_cents, starts_at: p.starts_at, ends_at: p.ends_at, sort_order: p.sort_order });
    phasesByType.set(p.ticket_type_id, arr);
  }

  const p_ticket_types = types.map((t) => {
    const ph = (phasesByType.get(t.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    return {
      name: t.name,
      price_cents: t.price_cents,
      capacity: t.capacity ?? 0,
      is_unlimited: t.is_unlimited,
      sort_order: t.sort_order,
      // create_brand_event exige >=1 fase; si el tipo no tenía, sintetizamos la base.
      phases: ph.length ? ph : [{ price_cents: t.price_cents, starts_at: null, ends_at: null, sort_order: 0 }],
    };
  });

  const base = (ev.slug || 'evento').slice(0, 30).replace(/-+$/, '');
  const newSlug = `${base}-copia-${Math.random().toString(36).slice(2, 6)}`;

  const { data: newId, error } = await admin.rpc('create_brand_event', {
    p_brand_id: brandId,
    p_actor_user_id: user.id,
    p_event: {
      slug: newSlug,
      name: `${ev.name} (copia)`.slice(0, 120),
      description: ev.description,
      starts_at: ev.starts_at,
      ends_at: ev.ends_at,
      venue_name: ev.venue_name,
      venue_address: ev.venue_address,
      cover_url: ev.cover_url,
      min_age: ev.min_age ?? 18,
      refund_policy: ev.refund_policy,
    },
    p_ticket_types,
  });

  if (error || !newId) {
    const msg = error?.message ?? '';
    if (msg.includes('INSUFFICIENT_BALANCE')) {
      return { ok: false, message: t('No tienes saldo de eventos para clonar. Pide un pack a ParyGo.', 'You have no event balance to clone. Ask ParyGo for a pack.') };
    }
    if (error?.code === '23505') {
      // Colisión de slug (rarísima por el sufijo random) → reintenta el botón.
      return { ok: false, message: t('No se pudo generar el borrador. Prueba de nuevo.', 'Could not generate the draft. Try again.') };
    }
    return { ok: false, message: msg || t('No se pudo clonar el evento.', 'Could not clone the event.') };
  }
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId: newId as string, accion: 'event_cloned', diff: { from_event_id: eventId } });

  // create_brand_event no acepta venue_maps_url/lat/lng → los copiamos aparte
  // (best-effort, scopeado a la marca; si falla no rompe el clon ya creado).
  // Igual las medidas del flyer (0065): el clon usa la misma imagen.
  if (ev.venue_maps_url || ev.venue_lat != null || ev.venue_lng != null || ev.cover_w != null) {
    await admin
      .from('events')
      .update({
        venue_maps_url: ev.venue_maps_url, venue_lat: ev.venue_lat, venue_lng: ev.venue_lng,
        cover_w: ev.cover_w, cover_h: ev.cover_h,
      })
      .eq('id', newId as string)
      .eq('brand_id', brandId);
  }

  revalidatePath('/admin');
  redirect(`/admin/events/${newId}`);
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
  const { t } = await textosPanel();
  const auth = await authEvent(eventId, user);
  const brandId = auth?.brandId ?? null;
  if (!brandId) return { ok: false, message: t('No tienes permiso sobre este evento.', 'You do not have permission over this event.') };

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
  // Auditoría de super admin: además del registro de dominio de arriba, queda
  // firmado QUIÉN lo hizo y sobre qué marca (solo si actuó como super admin).
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId, accion: archived ? 'event_archived' : 'event_unarchived', diff: { archived } });
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
  const { t } = await textosPanel();
  const auth = await authEvent(eventId, user);
  const brandId = auth?.brandId ?? null;
  if (!brandId) return { ok: false, message: t('No tienes permiso sobre este evento.', 'You do not have permission over this event.') };

  const admin = createAdminClient();
  const { data: ev } = await admin
    .from('events')
    .select('id, name, cover_url')
    .eq('id', eventId)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (!ev) return { ok: false, message: t('Evento no encontrado.', 'Event not found.') };
  if ((confirmName ?? '').trim() !== ev.name) {
    return { ok: false, message: t('El nombre no coincide. Escribilo igual para confirmar.', "The name doesn't match. Type it exactly to confirm.") };
  }

  // Guard de historial: 0 órdenes Y 0 tickets, o se rechaza (archiva en su lugar).
  const [{ count: orders }, { count: tickets }] = await Promise.all([
    admin.from('orders').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    admin.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
  ]);
  if ((orders ?? 0) > 0 || (tickets ?? 0) > 0) {
    return { ok: false, message: t('No se puede eliminar: tiene ventas. Archiva en su lugar.', 'Cannot delete: it has sales. Archive it instead.') };
  }

  // Log ANTES de borrar (events_log.event_id queda SET NULL al borrar el evento).
  await admin.from('events_log').insert({
    brand_id: brandId, event_id: eventId, actor_user_id: user.id,
    type: 'event_deleted', payload: { name: ev.name },
  });
  // Auditoría de super admin: además del registro de dominio de arriba, queda
  // firmado QUIÉN lo hizo y sobre qué marca (solo si actuó como super admin).
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId: eventId, accion: 'event_deleted', diff: { name: ev.name } });

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

// Color del tipo (punto en el checkout). Estricto: #RRGGBB o vacío (= sin
// color). undefined = el formulario no mandó el campo (no se toca); false = inválido.
function parseColorHex(formData: FormData): string | null | undefined | false {
  if (!formData.has('color_hex')) return undefined;
  const v = String(formData.get('color_hex') ?? '').trim();
  if (v === '') return null;
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : false;
}

// ===== 2) Editar un tipo de entrada (con la REGLA SEGURA) =====
// sin ventas → libre; con ventas → NO bajar capacidad debajo de lo vendido, NO
// cambiar precio (congelado en order_items). Subir capacidad: sí. Precio: solo si
// el tipo NO tiene fases de preventa (>1 fase) — no tocamos la lógica de fases.
export async function updateTicketTypeAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const user = await requireSession();
  const { t } = await textosPanel();
  const ttId = String(formData.get('ticket_type_id') ?? '');
  const eventId = String(formData.get('event_id') ?? '');
  const auth = await authEvent(eventId, user);
  const brandId = auth?.brandId ?? null;
  if (!brandId) return { ok: false, message: t('No tienes permiso.', 'You do not have permission.') };

  const admin = createAdminClient();
  const { data: tt } = await admin
    .from('ticket_types')
    .select('id, event_id, name, price_cents, capacity, sold, is_unlimited, is_active, is_courtesy')
    .eq('id', ttId)
    .maybeSingle();
  if (!tt || tt.event_id !== eventId) return { ok: false, message: t('Ese tipo no es de este evento.', 'That type does not belong to this event.') };

  const name = String(formData.get('name') ?? '').trim().slice(0, 80) || tt.name;
  const isActive = formData.get('is_active') === 'on';
  const isUnlimited = formData.get('is_unlimited') === 'on';
  const newPriceCents = Math.round(parseFloat(String(formData.get('price_soles') ?? '')) * 100);
  const { data: evCfg } = await admin.from('events').select('is_published, is_free').eq('id', eventId).maybeSingle();
  const eventoEsGratis = evCfg?.is_free === true;
  const precioFinal = Number.isFinite(newPriceCents) ? newPriceCents : tt.price_cents;
  // "Cortesía" ya NO es una casilla (Paul, 2026-09-23: "gratis y cortesía es
  // prácticamente lo mismo"; la marcó para que la entrada SE LLAME cortesía y
  // la página se quedó sin entradas). Lo que ve la gente es el NOMBRE. La
  // regla la decide el precio: en un evento que COBRA, S/0 = cortesía (no se
  // vende; el trigger 0059 hace lo mismo al insertar); en un evento GRATIS,
  // una entrada de S/0 siempre se ofrece.
  const isCourtesy = !eventoEsGratis && precioFinal === 0;
  const newCapacity = parseInt(String(formData.get('capacity') ?? ''), 10);
  const sold = tt.sold ?? 0;
  // Descripción opcional (texto mostrado en el checkout). No afecta precio ni
  // cantidad; solo presentación. Vacío → null (no deja hueco en la UI).
  const description = String(formData.get('description') ?? '').trim().slice(0, 280);

  const update: Record<string, unknown> = { name, is_active: isActive, description: description || null };
  const colorHex = parseColorHex(formData);
  if (colorHex === false) return { ok: false, message: t('Color inválido.', 'Invalid color.') };
  if (colorHex !== undefined) update.color_hex = colorHex;
  update.is_courtesy = isCourtesy;

  // NO dejar un evento PUBLICADO sin nada a la venta (2026-09-23: la página de
  // compra de Code mostró "Las entradas estarán disponibles pronto"). Si este
  // tipo deja de ofrecerse al público (pausado, o precio 0 en un evento que
  // cobra) y no queda otro que se ofrezca, se rechaza con una explicación.
  {
    if (evCfg?.is_published) {
      const eraPublica = tt.is_active && isPubliclyOffered(tt.price_cents, { eventoEsGratis, esCortesia: tt.is_courtesy });
      const seraPublica = isActive && isPubliclyOffered(precioFinal, { eventoEsGratis, esCortesia: isCourtesy });
      if (eraPublica && !seraPublica) {
        const { data: otras } = await admin.from('ticket_types').select('id, price_cents, is_active, is_courtesy').eq('event_id', eventId).neq('id', tt.id);
        // Una entrada PRIVADA (solo con link, 0066) no cuenta como "a la venta".
        const privadas = await tokensPrivados(admin, (otras ?? []).map((o) => o.id));
        const quedaAlguna = (otras ?? []).some((o) => o.is_active && !privadas.has(o.id) && isPubliclyOffered(o.price_cents, { eventoEsGratis, esCortesia: o.is_courtesy }));
        if (!quedaAlguna) {
          return { ok: false, message: t('Es la única entrada a la venta de tu evento publicado: si la pausas, tu página se queda sin entradas. Crea otra entrada primero, o pasa el evento a borrador.', 'This is the only ticket on sale for your published event: if you pause it, your page will be left without tickets. Create another ticket first, or set the event to draft.') };
        }
      }
    }
  }

  // --- Descuento por cantidad (bulk): min 0 (off) o 2-50; pct 0-90 ---
  // Tope 10 = máximo por compra (Zod en checkout); umbrales mayores serían inalcanzables.
  const bulkMinQty = Math.max(0, Math.min(10, parseInt(String(formData.get('bulk_min_qty') ?? '0'), 10) || 0));
  const bulkPct = Math.max(0, Math.min(90, parseInt(String(formData.get('bulk_discount_pct') ?? '0'), 10) || 0));
  update.bulk_min_qty = bulkMinQty >= 2 ? bulkMinQty : 0; // <2 no tiene sentido → off
  update.bulk_discount_pct = update.bulk_min_qty ? bulkPct : 0;

  // --- Capacidad / ilimitado ---
  if (isUnlimited) {
    update.is_unlimited = true;
  } else {
    if (!Number.isFinite(newCapacity) || newCapacity < 1) return { ok: false, message: t('Capacidad inválida.', 'Invalid capacity.') };
    if (newCapacity < sold) return { ok: false, message: t(`No puedes bajar la capacidad por debajo de lo vendido (${sold}).`, `You cannot lower the capacity below what's already sold (${sold}).`) };
    update.is_unlimited = false;
    update.capacity = newCapacity;
  }

  // Fases del tipo: una sola lectura (conteo para la regla de preventa y precios
  // para la regla de S/0 más abajo).
  const { data: phaseRows } = await admin.from('ticket_type_price_phases').select('price_cents').eq('ticket_type_id', ttId);

  // --- Precio: con ventas, congelado; sin ventas, editable salvo preventa ---
  if (Number.isFinite(newPriceCents) && newPriceCents !== tt.price_cents) {
    if (sold > 0) {
      return { ok: false, message: t('No se puede cambiar el precio de un tipo que ya tiene ventas (el precio queda congelado para quienes ya compraron).', 'You cannot change the price of a type that already has sales (the price stays frozen for those who already bought).') };
    }
    if (newPriceCents < 0) return { ok: false, message: t('Precio inválido.', 'Invalid price.') };
    const phaseCount = (phaseRows ?? []).length;
    if (phaseCount > 1) {
      return { ok: false, message: t('Este tipo tiene fases de preventa; el precio se gestiona por fases (no editable aquí).', 'This type has presale phases; the price is managed by phases (not editable here).') };
    }
    update.price_cents = newPriceCents;
  }

  // Reglas de precio sobre el estado RESULTANTE (precio/fases + ilimitado). La
  // confirmación de S/0 solo se pide si el precio PASA a 0 en esta edición.
  const priceChanged = typeof update.price_cents === 'number';
  const resultingPrices = priceChanged
    ? [update.price_cents as number]
    : [tt.price_cents, ...(phaseRows ?? []).map((p) => p.price_cents)];
  const becomingFree = priceChanged && update.price_cents === 0;
  const pricingErr = validateTicketTypePricing(
    [{ name, isUnlimited: (update.is_unlimited as boolean | undefined) ?? tt.is_unlimited, pricesCents: resultingPrices }],
    { freeConfirmed: !becomingFree || formData.get('confirm_free') === '1' },
    await idiomaPanel()
  );
  if (pricingErr) return { ok: false, message: pricingErr };

  const { error } = await admin.from('ticket_types').update(update).eq('id', ttId).eq('event_id', eventId);
  if (error) return { ok: false, message: mensajePrueba(error.message, await idiomaPanel()) ?? error.message };
  // Si hay UNA fase base (sin ventas), la alineamos para que el precio activo
  // coincida. DESPUÉS del update del tipo: antes corría primero y, si una
  // validación de abajo o el tope de la prueba (0069) rechazaba el guardado,
  // la fase (el precio que se COBRA) quedaba con el precio nuevo igual.
  if (priceChanged && (phaseRows ?? []).length === 1) {
    await admin.from('ticket_type_price_phases').update({ price_cents: update.price_cents as number }).eq('ticket_type_id', ttId);
  }

  await admin.from('events_log').insert({ brand_id: brandId, event_id: eventId, actor_user_id: user.id, type: 'ticket_type_edited', payload: { ticket_type_id: ttId } });
  // Auditoría de super admin: además del registro de dominio de arriba, queda
  // firmado QUIÉN lo hizo y sobre qué marca (solo si actuó como super admin).
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId: eventId, accion: 'ticket_type_edited', diff: { ticket_type_id: ttId, cambios: update } });
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/editar`);
  return { ok: true, message: t(`"${name}" actualizado.`, `"${name}" updated.`) };
}

// ===== 3) Crear un tipo de entrada nuevo (libre) =====
export async function createTicketTypeAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const user = await requireSession();
  const { t } = await textosPanel();
  const eventId = String(formData.get('event_id') ?? '');
  const auth = await authEvent(eventId, user);
  const brandId = auth?.brandId ?? null;
  if (!brandId) return { ok: false, message: t('No tienes permiso.', 'You do not have permission.') };

  const name = String(formData.get('name') ?? '').trim().slice(0, 80);
  if (name.length < 1) return { ok: false, message: t('Pon un nombre.', 'Enter a name.') };
  const description = String(formData.get('description') ?? '').trim().slice(0, 280);
  const isUnlimited = formData.get('is_unlimited') === 'on';
  const colorHex = parseColorHex(formData);
  if (colorHex === false) return { ok: false, message: t('Color inválido.', 'Invalid color.') };
  const priceCents =Math.round(parseFloat(String(formData.get('price_soles') ?? '')) * 100);
  if (!Number.isFinite(priceCents) || priceCents < 0) return { ok: false, message: t('Precio inválido.', 'Invalid price.') };
  const capacity = isUnlimited ? 0 : parseInt(String(formData.get('capacity') ?? ''), 10);
  if (!isUnlimited && (!Number.isFinite(capacity) || capacity < 1)) return { ok: false, message: t('Capacidad inválida.', 'Invalid capacity.') };
  const pricingErr = validateTicketTypePricing(
    [{ name, isUnlimited, pricesCents: [priceCents] }],
    { freeConfirmed: formData.get('confirm_free') === '1' },
    await idiomaPanel()
  );
  if (pricingErr) return { ok: false, message: pricingErr };
  const bulkMinQtyRaw = Math.max(0, Math.min(10, parseInt(String(formData.get('bulk_min_qty') ?? '0'), 10) || 0));
  const bulkMinQty = bulkMinQtyRaw >= 2 ? bulkMinQtyRaw : 0;
  const bulkPct = bulkMinQty ? Math.max(0, Math.min(90, parseInt(String(formData.get('bulk_discount_pct') ?? '0'), 10) || 0)) : 0;

  const admin = createAdminClient();
  const { data: maxRow } = await admin.from('ticket_types').select('sort_order').eq('event_id', eventId).order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const sortOrder = (maxRow?.sort_order ?? -1) + 1;

  // Una privada nace PAUSADA y se activa recién con su token puesto: nunca
  // queda un instante a la venta en la página pública.
  const privada = formData.get('privada') === 'on';
  const { data: created, error } = await admin
    .from('ticket_types')
    .insert({ event_id: eventId, name, description: description || null, price_cents: priceCents, capacity, is_unlimited: isUnlimited, is_active: !privada, sort_order: sortOrder, sold: 0, reserved: 0, max_scans: 1, bulk_min_qty: bulkMinQty, bulk_discount_pct: bulkPct, color_hex: colorHex ?? null })
    .select('id')
    .single();
  if (error || !created) return { ok: false, message: mensajePrueba(error?.message, await idiomaPanel()) ?? error?.message ?? 'No se pudo crear el tipo.' };

  // Fase base (todo el período) para que el precio activo se resuelva como los demás.
  await admin.from('ticket_type_price_phases').insert({ ticket_type_id: created.id, name: 'Base', price_cents: priceCents, starts_at: null, ends_at: null, sort_order: 0 });
  // Privada desde el inicio (solo con link, 0066).
  if (privada) {
    // Cuántas por persona (0068): lo que puso el organizador; por defecto 1 si es gratis.
    const lim = parseMaxPorPersona(formData.get('max_por_persona'));
    const { error: ePriv } = await admin.from('ticket_type_access').insert({ ticket_type_id: created.id, token: generarToken(), max_por_persona: lim === undefined ? (priceCents === 0 ? 1 : null) : lim });
    if (ePriv) return { ok: false, message: t('Se creó la entrada PAUSADA pero no su link privado. Ábrela, toca "Hacerla privada" y actívala.', 'The ticket was created PAUSED but its private link was not. Open it, tap "Make it private" and activate it.') };
    await admin.from('ticket_types').update({ is_active: true }).eq('id', created.id);
  }

  await admin.from('events_log').insert({ brand_id: brandId, event_id: eventId, actor_user_id: user.id, type: 'ticket_type_created', payload: { ticket_type_id: created.id, name } });
  // Auditoría de super admin: además del registro de dominio de arriba, queda
  // firmado QUIÉN lo hizo y sobre qué marca (solo si actuó como super admin).
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId, accion: 'ticket_type_created', diff: { ticket_type_id: created.id } });
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/editar`);
  return { ok: true, message: t(`"${name}" creado.`, `"${name}" created.`) };
}

// ===== Entradas PRIVADAS con link (0066) =====
// Privada = el tipo tiene fila en ticket_type_access: no se ofrece al público y
// solo se reclama/compra con …/<evento>?acceso=TOKEN. Hacerla pública borra la
// fila; cambiar el link genera otro token (el viejo deja de servir al toque).
// Mismo guard que el resto: dueño por membresía o super admin en modo edición.
export async function setTicketTypePrivateAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const user = await requireSession();
  const { t } = await textosPanel();
  const eventId = String(formData.get('event_id') ?? '');
  const ttId = String(formData.get('ticket_type_id') ?? '');
  const accion = String(formData.get('accion') ?? '');
  const auth = await authEvent(eventId, user);
  const brandId = auth?.brandId ?? null;
  if (!brandId) return { ok: false, message: t('No tienes permiso.', 'You do not have permission.') };

  const admin = createAdminClient();
  const { data: tt } = await admin.from('ticket_types').select('id, event_id, name, price_cents').eq('id', ttId).maybeSingle();
  if (!tt || tt.event_id !== eventId) return { ok: false, message: t('Esa entrada no es de este evento.', 'That ticket does not belong to this event.') };

  let message: string;
  if (accion === 'limite') {
    // Cuántas puede reclamar cada persona con el link (0068). Lo aplica
    // reserve_order_stock bajo lock; acá solo se guarda el número.
    const lim = parseMaxPorPersona(formData.get('max_por_persona'));
    if (lim === undefined) return { ok: false, message: t('Pon un número del 1 al 100, o déjalo vacío para no limitar.', 'Enter a number from 1 to 100, or leave it empty for no limit.') };
    const { data: upd, error } = await admin.from('ticket_type_access').update({ max_por_persona: lim }).eq('ticket_type_id', tt.id).select('ticket_type_id');
    if (error || !upd?.length) return { ok: false, message: t('No se pudo guardar. Intenta de nuevo.', 'Could not save. Try again.') };
    message = lim === null ? t(`"${tt.name}": sin límite por persona.`, `"${tt.name}": no limit per person.`) : t(`"${tt.name}": hasta ${lim} por persona.`, `"${tt.name}": up to ${lim} per person.`);
  } else if (accion === 'privada' || accion === 'cambiar') {
    const token = generarToken();
    const { error } = await admin.from('ticket_type_access').upsert(
      accion === 'cambiar'
        ? { ticket_type_id: tt.id, token, rotated_at: new Date().toISOString() }
        : { ticket_type_id: tt.id, token, rotated_at: null, max_por_persona: tt.price_cents === 0 ? 1 : null },
      { onConflict: 'ticket_type_id' },
    );
    if (error) return { ok: false, message: t('No se pudo generar el link. Intenta de nuevo.', 'Could not generate the link. Try again.') };
    message = accion === 'cambiar'
      ? t(`Link de "${tt.name}" cambiado. El anterior ya no sirve.`, `Link for "${tt.name}" changed. The old one no longer works.`)
      : t(`"${tt.name}" ahora es privada: solo se ve con su link.`, `"${tt.name}" is now private: it's only visible with its link.`);
  } else if (accion === 'publica') {
    const { error } = await admin.from('ticket_type_access').delete().eq('ticket_type_id', tt.id);
    if (error) return { ok: false, message: t('No se pudo hacer pública. Intenta de nuevo.', 'Could not make it public. Try again.') };
    message = t(`"${tt.name}" ahora es pública.`, `"${tt.name}" is now public.`);
  } else {
    return { ok: false, message: t('Acción inválida.', 'Invalid action.') };
  }

  await admin.from('events_log').insert({ brand_id: brandId, event_id: eventId, actor_user_id: user.id, type: 'ticket_type_access_changed', payload: { ticket_type_id: tt.id, accion, max_por_persona: String(formData.get('max_por_persona') ?? '') } });
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId, accion: 'ticket_type_access_changed', diff: { ticket_type_id: tt.id, accion } });
  revalidatePath(`/admin/events/${eventId}/entradas`);
  revalidatePath(`/admin/events/${eventId}`);
  return { ok: true, message };
}

// ===== Orden de las entradas en la página de compra =====
// Mueve una entrada un lugar arriba/abajo y renumera todas 0..n-1 (así un
// sort_order repetido de datos viejos también queda arreglado). Solo toca el
// orden de presentación: nada de precio, stock ni pago.
export async function moveTicketTypeAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const user = await requireSession();
  const { t } = await textosPanel();
  const eventId = String(formData.get('event_id') ?? '');
  const ttId = String(formData.get('ticket_type_id') ?? '');
  const dir = formData.get('dir') === 'up' ? -1 : 1;
  const auth = await authEvent(eventId, user);
  if (!auth?.brandId) return { ok: false, message: t('No tienes permiso.', 'You do not have permission.') };

  const admin = createAdminClient();
  const { data: tts, error } = await admin.from('ticket_types').select('id').eq('event_id', eventId).order('sort_order').order('created_at');
  if (error || !tts) return { ok: false, message: t('No se pudo leer las entradas.', 'Could not read the tickets.') };
  const ids = tts.map((tt) => tt.id as string);
  const i = ids.indexOf(ttId);
  const j = i + dir;
  if (i < 0) return { ok: false, message: t('Esa entrada no es de este evento.', 'That ticket does not belong to this event.') };
  if (j < 0 || j >= ids.length) return { ok: true, message: null };
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];

  const res = await Promise.all(ids.map((id, n) => admin.from('ticket_types').update({ sort_order: n }).eq('id', id).eq('event_id', eventId)));
  if (res.some((r) => r.error)) return { ok: false, message: t('No se pudo guardar el orden. Intenta de nuevo.', 'Could not save the order. Try again.') };
  await auditarEscrituraSuper(admin, { user, modo: auth.modo ?? null, brandId: auth.brandId, eventId, accion: 'ticket_type_moved', diff: { ticket_type_id: ttId, dir } });
  revalidatePath(`/admin/events/${eventId}/entradas`);
  return { ok: true, message: null };
}
