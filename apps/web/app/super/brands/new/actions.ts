'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';

export type FormState = {
  ok: boolean;
  message: string | null;
  fieldErrors?: Partial<Record<string, string>>;
};

const schema = z.object({
  name: z.string().min(2).max(60),
  slug: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/, 'Solo minúsculas, números y guiones'),
  contact_email: z.string().email(),
  whatsapp_e164: z
    .string()
    .regex(/^\+\d{8,15}$/, 'Formato +51999000000')
    .optional()
    .or(z.literal('')),
  yape_number: z.string().max(40).optional().or(z.literal('')),
  yape_holder: z.string().max(80).optional().or(z.literal('')),
  mp_access_token: z.string().min(10).optional().or(z.literal('')),
  mp_public_key: z.string().min(10).optional().or(z.literal('')),
  primary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .or(z.literal('')),
  secondary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .or(z.literal('')),
});

const RESERVED = new Set(['app', 'www', 'api', 'admin', 'super', 'docs', 'status', 'mail', 'cdn', 'static']);

export async function createBrandAction(
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
    return {
      ok: false,
      message: 'Revisá los campos marcados.',
      fieldErrors,
    };
  }

  if (RESERVED.has(parsed.data.slug)) {
    return { ok: false, message: 'Ese slug está reservado.', fieldErrors: { slug: 'Reservado' } };
  }

  const admin = createAdminClient();

  // Random per-brand webhook HMAC secret. Stored in plain text — needed to
  // verify incoming MP webhook signatures.
  const webhookSecret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

  const themeJson = {
    primary_color: parsed.data.primary_color || '#FF1F8F',
    secondary_color: parsed.data.secondary_color || '#00E5FF',
  };

  // Step 1: insert brand row (without MP creds — those go via secured RPC)
  const { data: brand, error: insertErr } = await admin
    .from('brands')
    .insert({
      slug: parsed.data.slug,
      name: parsed.data.name,
      contact_email: parsed.data.contact_email,
      whatsapp_e164: parsed.data.whatsapp_e164 || null,
      yape_number: parsed.data.yape_number || null,
      yape_holder: parsed.data.yape_holder || null,
      theme_json: themeJson,
      mp_webhook_secret: webhookSecret,
    })
    .select('id, slug')
    .single();

  if (insertErr || !brand) {
    if (insertErr?.code === '23505') {
      return { ok: false, message: 'Ya existe una marca con ese slug.', fieldErrors: { slug: 'En uso' } };
    }
    return { ok: false, message: insertErr?.message ?? 'No se pudo crear.' };
  }

  // Step 2: store MP credentials encrypted (if provided)
  if (parsed.data.mp_access_token || parsed.data.mp_public_key) {
    const { error: rpcErr } = await admin.rpc('set_brand_mp_credentials', {
      p_brand_id: brand.id,
      p_access_token: parsed.data.mp_access_token || null,
      p_public_key: parsed.data.mp_public_key || null,
      p_encryption_key: serverEnv.BRAND_CREDS_ENCRYPTION_KEY,
    });
    if (rpcErr) {
      // Brand was created but creds failed — surface the issue, brand still usable for Yape.
      revalidatePath('/super/brands');
      return {
        ok: false,
        message: `Marca creada pero las credenciales MP fallaron: ${rpcErr.message}. Probá guardarlas desde la página de la marca.`,
      };
    }
  }

  // Step 3: log event
  await admin.from('events_log').insert({
    brand_id: brand.id,
    type: 'brand_created',
    payload: { slug: brand.slug, name: parsed.data.name },
  });

  revalidatePath('/super/brands');
  redirect(`/super/brands/${brand.slug}`);
}
