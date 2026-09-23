'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { contextoEscritura } from '@/lib/impersonation';
import { auditarEscrituraSuper } from '@/lib/auditoriaSuper';
import { uploadEventCover } from '@/lib/brandAssets';
import { limaToIso, validateEventWindow, validateTicketTypePricing } from '@/lib/eventValidation';

export type FormState = {
  ok: boolean;
  message: string | null;
  fieldErrors?: Partial<Record<string, string>>;
};

const phaseSchema = z.object({
  price_cents: z.number().int().min(0),
  starts_at: z.string().datetime().nullable(),
  ends_at: z.string().datetime().nullable(),
  sort_order: z.number().int(),
});

const ticketTypeSchema = z.object({
  name: z.string().min(1).max(80),
  // Descripción opcional del tipo (solo presentación en el checkout).
  description: z.string().max(280).optional().or(z.literal('')),
  price_cents: z.number().int().min(0),
  capacity: z.number().int().min(0),
  is_unlimited: z.boolean(),
  sort_order: z.number().int(),
  phases: z.array(phaseSchema).min(1),
});

const eventSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(42).regex(/^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$/, 'Slug inválido'),
  description: z.string().max(2000).optional().or(z.literal('')),
  starts_at: z.string().min(1, 'Requerido'),
  ends_at: z.string().optional().or(z.literal('')),
  venue_name: z.string().max(120).optional().or(z.literal('')),
  venue_address: z.string().max(200).optional().or(z.literal('')),
  min_age: z.string().optional().or(z.literal('')),
  refund_policy: z.string().max(500).optional().or(z.literal('')),
});

export async function createBrandEventAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireSession();
  // ENFORCEMENT: brand from the session membership, NEVER the form.
  const ctxW = contextoEscritura(user);
  if (!ctxW) {
    return { ok: false, message: 'No tienes acceso de promotor.' };
  }
  const brandId = ctxW.brandId;

  const raw = Object.fromEntries(formData.entries());
  const parsedEvent = eventSchema.safeParse(raw);
  if (!parsedEvent.success) {
    const fieldErrors: Record<string, string> = {};
    for (const e of parsedEvent.error.errors) {
      const p = e.path.join('.');
      if (p) fieldErrors[p] = e.message;
    }
    return { ok: false, message: 'Revisa los campos del evento.', fieldErrors };
  }

  let ticketTypesRaw: unknown;
  try {
    ticketTypesRaw = JSON.parse(String(formData.get('ticket_types_json') ?? '[]'));
  } catch {
    return { ok: false, message: 'Tipos de entrada inválidos.' };
  }
  const parsedTT = z.array(ticketTypeSchema).min(1, 'Agrega al menos un tipo de entrada').safeParse(ticketTypesRaw);
  if (!parsedTT.success) {
    return { ok: false, message: parsedTT.error.errors[0]?.message ?? 'Revisa los tipos de entrada.' };
  }

  // Fechas en hora de Lima (explícito: en Cloudflare el server corre en UTC).
  // Todo se valida ANTES de subir el flyer y de consumir saldo.
  const startsIso = limaToIso(parsedEvent.data.starts_at);
  if (!startsIso) {
    return { ok: false, message: 'Fecha de inicio inválida.', fieldErrors: { starts_at: 'Inválida' } };
  }
  const endsIso = parsedEvent.data.ends_at ? limaToIso(parsedEvent.data.ends_at) : null;
  if (parsedEvent.data.ends_at && !endsIso) {
    return { ok: false, message: 'Fecha de fin inválida.', fieldErrors: { ends_at: 'Inválida' } };
  }
  const windowErr = validateEventWindow({ startsIso, endsIso, requireFutureStart: true });
  if (windowErr) {
    return { ok: false, message: windowErr.message, fieldErrors: { [windowErr.field]: windowErr.message } };
  }
  const pricingErr = validateTicketTypePricing(
    parsedTT.data.map((t) => ({
      name: t.name,
      isUnlimited: t.is_unlimited,
      pricesCents: [t.price_cents, ...t.phases.map((p) => p.price_cents)],
    })),
    { freeConfirmed: formData.get('confirm_free') === '1' }
  );
  if (pricingErr) return { ok: false, message: pricingErr };

  const admin = createAdminClient();

  // Flyer opcional: subir a brand-assets bajo el prefijo de la marca de la
  // sesión (la RLS exige <slug>/...). El slug sale de la sesión, nunca del form.
  let coverUrl: string | null = null;
  const coverFile = formData.get('cover');
  if (coverFile instanceof File && coverFile.size > 0) {
    const { data: b } = await admin.from('brands').select('slug').eq('id', brandId).single();
    const up = await uploadEventCover(admin, b!.slug, coverFile);
    if (!up.ok) return { ok: false, message: up.message, fieldErrors: { cover: up.message } };
    coverUrl = up.url;
  }

  const { data: newEventId, error } = await admin.rpc('create_brand_event', {
    p_brand_id: brandId, // from session
    p_actor_user_id: user.id,
    p_event: {
      slug: parsedEvent.data.slug,
      name: parsedEvent.data.name,
      description: parsedEvent.data.description || null,
      starts_at: startsIso,
      ends_at: endsIso,
      venue_name: parsedEvent.data.venue_name || null,
      venue_address: parsedEvent.data.venue_address || null,
      cover_url: coverUrl,
      min_age: parsedEvent.data.min_age ? parseInt(parsedEvent.data.min_age, 10) : 18,
      refund_policy: parsedEvent.data.refund_policy || null,
    },
    p_ticket_types: parsedTT.data,
  });

  // "Evento gratis" se setea DESPUÉS de crear, con un update común.
  // create_brand_event enumera sus columnas y es SECURITY DEFINER (consume el
  // saldo de packs): reescribirla para pasar un flag de presentación sería
  // mucho más riesgo que beneficio. El evento nace pago —el default seguro— y
  // si el promotor lo marcó gratis, se corrige acá, antes de que pueda
  // publicarse (nace is_published = false).
  if (!error && newEventId && formData.get('is_free') === 'on') {
    const { error: freeErr } = await admin.from('events').update({ is_free: true }).eq('id', newEventId);
    if (freeErr) console.error('[createEvent] no se pudo marcar gratis', { newEventId, detalle: freeErr.message });
  }

  if (error || !newEventId) {
    const msg = error?.message ?? '';
    if (msg.includes('INSUFFICIENT_BALANCE')) {
      return { ok: false, message: 'Tu marca no tiene saldo de eventos. Contacta a ParyGo para cargar un pack.' };
    }
    if (msg.includes('NO_TICKET_TYPES')) {
      return { ok: false, message: 'Agrega al menos un tipo de entrada.' };
    }
    if (error?.code === '23505') {
      if (/ttpp_ticket_sort_uniq/.test(msg)) {
        return { ok: false, message: 'Dos fases de un tipo de entrada tienen el mismo orden.' };
      }
      return { ok: false, message: 'Ya existe un evento con ese slug.', fieldErrors: { slug: 'En uso' } };
    }
    if (error?.code === '23514') {
      return { ok: false, message: 'Una fase de precio tiene fechas o precio inválidos.' };
    }
    return { ok: false, message: msg || 'No se pudo crear el evento.' };
  }
  // Crear un evento gasta saldo de la marca: si fue el super admin, queda firmado.
  await auditarEscrituraSuper(admin, { user, modo: ctxW.modo, brandId, eventId: newEventId as string, accion: 'event_created', diff: { slug: parsedEvent.data.slug, is_free: formData.get('is_free') === 'on' } });

  revalidatePath('/admin');
  redirect(`/admin/events/${newEventId}`);
}
