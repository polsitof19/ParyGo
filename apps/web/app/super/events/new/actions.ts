'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export type FormState = {
  ok: boolean;
  message: string | null;
  fieldErrors?: Partial<Record<string, string>>;
};

const schema = z.object({
  brand_id: z.string().uuid(),
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(42)
    .regex(/^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$/),
  description: z.string().max(2000).optional().or(z.literal('')),
  starts_at: z.string().min(1, 'Requerido'),
  ends_at: z.string().optional().or(z.literal('')),
  venue_name: z.string().max(120).optional().or(z.literal('')),
  venue_address: z.string().max(200).optional().or(z.literal('')),
  venue_lat: z.string().optional().or(z.literal('')),
  venue_lng: z.string().optional().or(z.literal('')),
  min_age: z.string().optional().or(z.literal('')),
  refund_policy: z.string().max(500).optional().or(z.literal('')),
});

function maybeFloat(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function createEventAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireSession({ superAdmin: true });

  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const err of parsed.error.errors) {
      const path = err.path.join('.');
      if (path) fieldErrors[path] = err.message;
    }
    return { ok: false, message: 'Revisá los campos marcados.', fieldErrors };
  }

  const admin = createAdminClient();

  const startsAt = new Date(parsed.data.starts_at);
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, message: 'Fecha de inicio inválida.', fieldErrors: { starts_at: 'Inválida' } };
  }
  const endsAt = parsed.data.ends_at ? new Date(parsed.data.ends_at) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    return { ok: false, message: 'Fecha de fin inválida.', fieldErrors: { ends_at: 'Inválida' } };
  }

  const { data: event, error } = await admin
    .from('events')
    .insert({
      brand_id: parsed.data.brand_id,
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
      venue_name: parsed.data.venue_name || null,
      venue_address: parsed.data.venue_address || null,
      venue_lat: maybeFloat(parsed.data.venue_lat),
      venue_lng: maybeFloat(parsed.data.venue_lng),
      min_age: parsed.data.min_age ? parseInt(parsed.data.min_age, 10) : 18,
      refund_policy: parsed.data.refund_policy || null,
      is_published: false,
    })
    .select('id, slug, brand_id')
    .single();

  if (error || !event) {
    if (error?.code === '23505') {
      return { ok: false, message: 'Ya existe un evento con ese slug en esta marca.', fieldErrors: { slug: 'En uso' } };
    }
    return { ok: false, message: error?.message ?? 'No se pudo crear.' };
  }

  await admin.from('events_log').insert({
    brand_id: event.brand_id,
    event_id: event.id,
    type: 'event_created',
    payload: { slug: event.slug, name: parsed.data.name },
  });

  revalidatePath('/super/events');
  redirect(`/super/events/${event.id}`);
}
