'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { uploadEventCover } from '@/lib/brandAssets';

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
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) {
    return { ok: false, message: 'No tenés acceso de promotor.' };
  }
  const brandId = membership.brandId;

  const raw = Object.fromEntries(formData.entries());
  const parsedEvent = eventSchema.safeParse(raw);
  if (!parsedEvent.success) {
    const fieldErrors: Record<string, string> = {};
    for (const e of parsedEvent.error.errors) {
      const p = e.path.join('.');
      if (p) fieldErrors[p] = e.message;
    }
    return { ok: false, message: 'Revisá los campos del evento.', fieldErrors };
  }

  let ticketTypesRaw: unknown;
  try {
    ticketTypesRaw = JSON.parse(String(formData.get('ticket_types_json') ?? '[]'));
  } catch {
    return { ok: false, message: 'Tipos de entrada inválidos.' };
  }
  const parsedTT = z.array(ticketTypeSchema).min(1, 'Agregá al menos un tipo de entrada').safeParse(ticketTypesRaw);
  if (!parsedTT.success) {
    return { ok: false, message: parsedTT.error.errors[0]?.message ?? 'Revisá los tipos de entrada.' };
  }

  const startsAt = new Date(parsedEvent.data.starts_at);
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, message: 'Fecha de inicio inválida.', fieldErrors: { starts_at: 'Inválida' } };
  }
  const endsAt = parsedEvent.data.ends_at ? new Date(parsedEvent.data.ends_at) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    return { ok: false, message: 'Fecha de fin inválida.', fieldErrors: { ends_at: 'Inválida' } };
  }

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
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
      venue_name: parsedEvent.data.venue_name || null,
      venue_address: parsedEvent.data.venue_address || null,
      cover_url: coverUrl,
      min_age: parsedEvent.data.min_age ? parseInt(parsedEvent.data.min_age, 10) : 18,
      refund_policy: parsedEvent.data.refund_policy || null,
    },
    p_ticket_types: parsedTT.data,
  });

  if (error || !newEventId) {
    const msg = error?.message ?? '';
    if (msg.includes('INSUFFICIENT_BALANCE')) {
      return { ok: false, message: 'Tu marca no tiene saldo de eventos. Contactá a ParyGo para cargar un pack.' };
    }
    if (msg.includes('NO_TICKET_TYPES')) {
      return { ok: false, message: 'Agregá al menos un tipo de entrada.' };
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

  revalidatePath('/admin');
  redirect(`/admin/events/${newEventId}`);
}
