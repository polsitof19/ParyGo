'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { nanoid } from 'nanoid';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export type SettingsState = {
  ok: boolean;
  message: string | null;
  fieldErrors?: Partial<Record<string, string>>;
};

const schema = z.object({
  contact_email: z.string().email('Email inválido').optional().or(z.literal('')),
  whatsapp_e164: z
    .string()
    .regex(/^\+\d{8,15}$/, 'Formato +51999000111')
    .optional()
    .or(z.literal('')),
  yape_number: z.string().max(20).optional().or(z.literal('')),
  yape_holder: z.string().max(120).optional().or(z.literal('')),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido'),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido'),
});

const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export async function updateBrandSettingsAction(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const user = await requireSession();
  // ENFORCEMENT: the brand comes from the session membership, NEVER the form.
  // A brand_admin can only ever edit their own brand.
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) {
    return { ok: false, message: 'No tenés acceso de promotor.' };
  }
  const brandId = membership.brandId;

  const parsed = schema.safeParse({
    contact_email: formData.get('contact_email') ?? '',
    whatsapp_e164: formData.get('whatsapp_e164') ?? '',
    yape_number: formData.get('yape_number') ?? '',
    yape_holder: formData.get('yape_holder') ?? '',
    primary_color: formData.get('primary_color') ?? '',
    secondary_color: formData.get('secondary_color') ?? '',
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const e of parsed.error.errors) {
      const p = e.path.join('.');
      if (p) fieldErrors[p] = e.message;
    }
    return { ok: false, message: 'Revisá los campos marcados.', fieldErrors };
  }

  const admin = createAdminClient();

  // Load the current brand (own its slug for the storage path + merge theme).
  const { data: brand, error: brandErr } = await admin
    .from('brands')
    .select('id, slug, theme_json')
    .eq('id', brandId)
    .single();
  if (brandErr || !brand) {
    return { ok: false, message: 'No se pudo cargar la marca.' };
  }

  const theme = (brand.theme_json ?? {}) as Record<string, unknown>;
  let logoUrl = (theme.logo_url as string | undefined) ?? null;

  // Optional logo upload to the public brand-assets bucket.
  const file = formData.get('logo');
  if (file instanceof File && file.size > 0) {
    const ext = LOGO_TYPES[file.type];
    if (!ext) {
      return { ok: false, message: 'Logo: usá PNG, JPG, WEBP o SVG.', fieldErrors: { logo: 'Tipo no permitido' } };
    }
    if (file.size > 2 * 1024 * 1024) {
      return { ok: false, message: 'El logo supera 2 MB.', fieldErrors: { logo: 'Muy grande' } };
    }
    const path = `${brand.slug}/logo-${nanoid(8)}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from('brand-assets')
      .upload(path, bytes, { contentType: file.type, cacheControl: '3600', upsert: true });
    if (upErr) {
      return { ok: false, message: `No se pudo subir el logo: ${upErr.message}` };
    }
    const { data: pub } = admin.storage.from('brand-assets').getPublicUrl(path);
    logoUrl = pub.publicUrl;
  }

  const nextTheme = {
    ...theme,
    primary_color: parsed.data.primary_color,
    secondary_color: parsed.data.secondary_color,
    logo_url: logoUrl,
  };

  const { error: updErr } = await admin
    .from('brands')
    .update({
      contact_email: parsed.data.contact_email || null,
      whatsapp_e164: parsed.data.whatsapp_e164 || null,
      yape_number: parsed.data.yape_number || null,
      yape_holder: parsed.data.yape_holder || null,
      theme_json: nextTheme,
    })
    .eq('id', brandId); // scoped to the admin's own brand
  if (updErr) {
    return { ok: false, message: updErr.message };
  }

  await admin.from('events_log').insert({
    brand_id: brandId,
    actor_user_id: user.id,
    type: 'brand_settings_updated',
    payload: { logo_changed: Boolean(file instanceof File && file.size > 0) },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/settings');
  return { ok: true, message: 'Configuración guardada. Los cambios ya están en vivo.' };
}
