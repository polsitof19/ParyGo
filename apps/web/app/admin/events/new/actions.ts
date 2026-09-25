'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { contextoEscritura } from '@/lib/impersonation';
import { auditarEscrituraSuper } from '@/lib/auditoriaSuper';
import { uploadEventCover, coverDims } from '@/lib/brandAssets';
import { limaToIso, validateEventWindow, validateTicketTypePricing } from '@/lib/eventValidation';
import { mensajePrueba } from '@/lib/prueba';
import { textosPanel, idiomaPanel } from '@/lib/idiomaServer';
import type { Textos } from '@/lib/idioma';

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

function eventSchema(t: Textos['t']) {
  return z.object({
    name: z.string().min(2).max(120),
    slug: z.string().min(2).max(42).regex(/^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$/, t('Slug inválido', 'Invalid slug')),
    description: z.string().max(2000).optional().or(z.literal('')),
    starts_at: z.string().min(1, t('Requerido', 'Required')),
    ends_at: z.string().optional().or(z.literal('')),
    venue_name: z.string().max(120).optional().or(z.literal('')),
    venue_address: z.string().max(200).optional().or(z.literal('')),
    min_age: z.string().optional().or(z.literal('')),
    refund_policy: z.string().max(500).optional().or(z.literal('')),
  });
}

export async function createBrandEventAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireSession();
  const { t } = await textosPanel();
  // ENFORCEMENT: brand from the session membership, NEVER the form.
  const ctxW = contextoEscritura(user);
  if (!ctxW) {
    return { ok: false, message: t('No tienes acceso de promotor.', 'You do not have promoter access.') };
  }
  const brandId = ctxW.brandId;

  const raw = Object.fromEntries(formData.entries());
  const parsedEvent = eventSchema(t).safeParse(raw);
  if (!parsedEvent.success) {
    const fieldErrors: Record<string, string> = {};
    for (const e of parsedEvent.error.errors) {
      const p = e.path.join('.');
      if (p) fieldErrors[p] = e.message;
    }
    return { ok: false, message: t('Revisa los campos del evento.', 'Check the event fields.'), fieldErrors };
  }

  let ticketTypesRaw: unknown;
  try {
    ticketTypesRaw = JSON.parse(String(formData.get('ticket_types_json') ?? '[]'));
  } catch {
    return { ok: false, message: t('Tipos de entrada inválidos.', 'Invalid ticket types.') };
  }
  const parsedTT = z.array(ticketTypeSchema).min(1, t('Agrega al menos un tipo de entrada', 'Add at least one ticket type')).safeParse(ticketTypesRaw);
  if (!parsedTT.success) {
    return { ok: false, message: parsedTT.error.errors[0]?.message ?? t('Revisa los tipos de entrada.', 'Check the ticket types.') };
  }

  // Fechas en hora de Lima (explícito: en Cloudflare el server corre en UTC).
  // Todo se valida ANTES de subir el flyer y de consumir saldo.
  const startsIso = limaToIso(parsedEvent.data.starts_at);
  if (!startsIso) {
    return { ok: false, message: t('Fecha de inicio inválida.', 'Invalid start date.'), fieldErrors: { starts_at: t('Inválida', 'Invalid') } };
  }
  const endsIso = parsedEvent.data.ends_at ? limaToIso(parsedEvent.data.ends_at) : null;
  if (parsedEvent.data.ends_at && !endsIso) {
    return { ok: false, message: t('Fecha de fin inválida.', 'Invalid end date.'), fieldErrors: { ends_at: t('Inválida', 'Invalid') } };
  }
  const windowErr = validateEventWindow({ startsIso, endsIso, requireFutureStart: true }, await idiomaPanel());
  if (windowErr) {
    return { ok: false, message: windowErr.message, fieldErrors: { [windowErr.field]: windowErr.message } };
  }
  const pricingErr = validateTicketTypePricing(
    parsedTT.data.map((t) => ({
      name: t.name,
      isUnlimited: t.is_unlimited,
      pricesCents: [t.price_cents, ...t.phases.map((p) => p.price_cents)],
    })),
    { freeConfirmed: formData.get('confirm_free') === '1' },
    await idiomaPanel()
  );
  if (pricingErr) return { ok: false, message: pricingErr };

  const admin = createAdminClient();

  // Flyer opcional: subir a brand-assets bajo el prefijo de la marca de la
  // sesión (la RLS exige <slug>/...). El slug sale de la sesión, nunca del form.
  let coverUrl: string | null = null;
  let dims: ReturnType<typeof coverDims> | null = null;
  const coverFile = formData.get('cover');
  if (coverFile instanceof File && coverFile.size > 0) {
    const { data: b } = await admin.from('brands').select('slug').eq('id', brandId).single();
    const up = await uploadEventCover(admin, b!.slug, coverFile, await idiomaPanel());
    if (!up.ok) return { ok: false, message: up.message, fieldErrors: { cover: up.message } };
    coverUrl = up.url;
    dims = coverDims(up);
  }

  // Con saldo, el camino de siempre. Sin saldo, la prueba gratis (0069) si la
  // marca la tiene: create_brand_trial_event la gasta y topa el evento a 50.
  // Ambos RPC son atómicos: esta lectura solo elige el camino, no autoriza.
  const { data: bal } = await admin.from('brands').select('event_balance, prueba_disponible').eq('id', brandId).single();
  const usarPrueba = (bal?.event_balance ?? 0) <= 0 && bal?.prueba_disponible === true;
  const { data: newEventId, error } = await admin.rpc(usarPrueba ? 'create_brand_trial_event' : 'create_brand_event', {
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

  // Las medidas del flyer (0065), por la misma razón: create_brand_event no
  // las conoce. Si esto falla, la página las mide por red (el respaldo).
  if (!error && newEventId && dims?.cover_w) {
    const { error: dimErr } = await admin.from('events').update(dims).eq('id', newEventId);
    if (dimErr) console.error('[createEvent] no se guardaron las medidas del flyer', { newEventId, detalle: dimErr.message });
  }

  if (error || !newEventId) {
    const msg = error?.message ?? '';
    const tope = mensajePrueba(msg, await idiomaPanel());
    if (tope) return { ok: false, message: tope };
    if (msg.includes('INSUFFICIENT_BALANCE') || msg.includes('NO_TRIAL')) {
      return { ok: false, message: t('Tu marca no tiene saldo de eventos. Contacta a ParyGo para cargar un pack.', 'Your brand has no event balance. Contact ParyGo to load a pack.') };
    }
    if (msg.includes('NO_TICKET_TYPES')) {
      return { ok: false, message: t('Agrega al menos un tipo de entrada.', 'Add at least one ticket type.') };
    }
    if (error?.code === '23505') {
      if (/ttpp_ticket_sort_uniq/.test(msg)) {
        return { ok: false, message: t('Dos fases de un tipo de entrada tienen el mismo orden.', 'Two phases of a ticket type have the same order.') };
      }
      return { ok: false, message: t('Ya existe un evento con ese slug.', 'An event with that slug already exists.'), fieldErrors: { slug: t('En uso', 'In use') } };
    }
    if (error?.code === '23514') {
      return { ok: false, message: t('Una fase de precio tiene fechas o precio inválidos.', 'A price phase has invalid dates or price.') };
    }
    return { ok: false, message: msg || t('No se pudo crear el evento.', 'Could not create the event.') };
  }
  // Crear un evento gasta saldo de la marca: si fue el super admin, queda firmado.
  await auditarEscrituraSuper(admin, { user, modo: ctxW.modo, brandId, eventId: newEventId as string, accion: 'event_created', diff: { slug: parsedEvent.data.slug, is_free: formData.get('is_free') === 'on' } });

  revalidatePath('/admin');
  redirect(`/admin/events/${newEventId}`);
}
