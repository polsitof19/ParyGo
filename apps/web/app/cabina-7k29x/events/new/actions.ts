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
  const user = await requireSession({ superAdmin: true });

  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const err of parsed.error.errors) {
      const path = err.path.join('.');
      if (path) fieldErrors[path] = err.message;
    }
    return { ok: false, message: 'Revisa los campos marcados.', fieldErrors };
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

  // Creating an event consumes 1 from the brand's event balance. The RPC does
  // the atomic decrement (race-safe, blocks at 0), the event insert and the
  // consumption log in a single transaction — if the insert fails the balance
  // is not spent. Balance 0 → INSUFFICIENT_BALANCE.
  const { data: newEventId, error } = await admin.rpc('consume_event_balance', {
    p_brand_id: parsed.data.brand_id,
    p_actor_user_id: user.id,
    p_event: {
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
    },
  });

  if (error || !newEventId) {
    if (error?.message?.includes('INSUFFICIENT_BALANCE')) {
      return {
        ok: false,
        message: 'Esta marca no tiene saldo de eventos. Carga un pack desde la página de la marca para poder crear.',
      };
    }
    if (error?.code === '23505') {
      return { ok: false, message: 'Ya existe un evento con ese slug en esta marca.', fieldErrors: { slug: 'En uso' } };
    }
    return { ok: false, message: error?.message ?? 'No se pudo crear.' };
  }

  await admin.from('events_log').insert({
    brand_id: parsed.data.brand_id,
    event_id: newEventId,
    type: 'event_created',
    payload: { slug: parsed.data.slug, name: parsed.data.name },
  });

  revalidatePath('/cabina-7k29x/events');
  redirect(`/cabina-7k29x/events/${newEventId}`);
}
