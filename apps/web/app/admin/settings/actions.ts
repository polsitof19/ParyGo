'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { nanoid } from 'nanoid';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { validateMercadoPagoToken } from '@/lib/mercadopago';

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
  instagram: z.string().max(120).optional().or(z.literal('')),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido'),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido'),
});

// Solo rasterizados (sin SVG): el bucket es público y un SVG con <script> sería
// XSS stored si se abre su URL directa (mismo criterio que lib/brandAssets.ts).
const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
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
    instagram: formData.get('instagram') ?? '',
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
  let yapeQrUrl = (theme.yape_qr_url as string | undefined) ?? null;

  // Optional logo upload to the public brand-assets bucket.
  const file = formData.get('logo');
  if (file instanceof File && file.size > 0) {
    const ext = LOGO_TYPES[file.type];
    if (!ext) {
      return { ok: false, message: 'Logo: usá PNG, JPG o WEBP.', fieldErrors: { logo: 'Tipo no permitido' } };
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

  // QR de Yape (imagen). Mismo bucket público + mismo criterio que el logo: solo
  // raster (sin SVG → XSS), path con slug del SERVER + nanoid no adivinable.
  if (formData.get('remove_yape_qr') === '1') {
    yapeQrUrl = null;
  }
  const qrFile = formData.get('yape_qr');
  if (qrFile instanceof File && qrFile.size > 0) {
    const ext = LOGO_TYPES[qrFile.type];
    if (!ext) {
      return { ok: false, message: 'QR de Yape: usá PNG, JPG o WEBP.', fieldErrors: { yape_qr: 'Tipo no permitido' } };
    }
    if (qrFile.size > 2 * 1024 * 1024) {
      return { ok: false, message: 'El QR supera 2 MB.', fieldErrors: { yape_qr: 'Muy grande' } };
    }
    const path = `${brand.slug}/yape-qr-${nanoid(8)}.${ext}`;
    const bytes = new Uint8Array(await qrFile.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from('brand-assets')
      .upload(path, bytes, { contentType: qrFile.type, cacheControl: '3600', upsert: true });
    if (upErr) {
      return { ok: false, message: `No se pudo subir el QR: ${upErr.message}` };
    }
    const { data: pub } = admin.storage.from('brand-assets').getPublicUrl(path);
    yapeQrUrl = pub.publicUrl;
  }

  const nextTheme = {
    ...theme,
    primary_color: parsed.data.primary_color,
    secondary_color: parsed.data.secondary_color,
    logo_url: logoUrl,
    yape_qr_url: yapeQrUrl,
  };

  // Avisos de Yape por email (Grupo C). Checkboxes → 'on'/ausente. Opt-in.
  const notifyYapeRecovery = formData.get('notify_yape_recovery') === 'on';
  const notifyYapeDigest = formData.get('notify_yape_digest') === 'on';

  const { error: updErr } = await admin
    .from('brands')
    .update({
      contact_email: parsed.data.contact_email || null,
      whatsapp_e164: parsed.data.whatsapp_e164 || null,
      yape_number: parsed.data.yape_number || null,
      yape_holder: parsed.data.yape_holder || null,
      instagram: parsed.data.instagram || null,
      notify_yape_recovery: notifyYapeRecovery,
      notify_yape_digest: notifyYapeDigest,
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

// =============================================================
// MercadoPago credentials (self-service del brand_admin)
// =============================================================
// Los tokens NUNCA viajan al cliente: se reciben del form, se validan contra MP
// y se guardan ENCRIPTADOS vía set_brand_mp_credentials (pgp_sym_encrypt,
// service_role-only). El brand_id SIEMPRE sale de la sesión, nunca del form, así
// que un brand_admin solo puede tocar SUS propias credenciales.

// Las credenciales de MercadoPago siempre empiezan con APP_USR- (producción) o
// TEST- (sandbox). El prefijo atrapa typos y campos cruzados antes de pegarle a
// MP; el access_token además se valida CONTRA MP abajo (la verdad real).
const MP_CRED_RE = /^(APP_USR-|TEST-)/;
const mpSchema = z.object({
  mp_access_token: z
    .string()
    .trim()
    .min(10, 'Access token demasiado corto')
    .max(400)
    .regex(MP_CRED_RE, 'El access token debe empezar con APP_USR- o TEST-'),
  mp_public_key: z
    .string()
    .trim()
    .min(10, 'Public key demasiado corta')
    .max(400)
    .regex(MP_CRED_RE, 'La public key debe empezar con APP_USR- o TEST-'),
});

export async function updateMpCredentialsAction(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const user = await requireSession();
  // ENFORCEMENT: el brand sale de la sesión, NUNCA del form.
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) {
    return { ok: false, message: 'No tenés acceso de promotor.' };
  }
  const brandId = membership.brandId;
  const admin = createAdminClient();
  const intent = String(formData.get('intent') ?? 'save');

  // Quitar credenciales (volver a Yape-only).
  if (intent === 'remove') {
    const { error } = await admin.rpc('set_brand_mp_credentials', {
      p_brand_id: brandId,
      p_access_token: null as unknown as string,
      p_public_key: null as unknown as string,
      p_encryption_key: serverEnv.BRAND_CREDS_ENCRYPTION_KEY,
    });
    if (error) return { ok: false, message: error.message };
    await admin.from('events_log').insert({
      brand_id: brandId,
      actor_user_id: user.id,
      type: 'brand_mp_credentials_removed',
      payload: {},
    });
    revalidatePath('/admin/settings');
    return { ok: true, message: 'Credenciales de MercadoPago eliminadas. Tu checkout vuelve a solo Yape.' };
  }

  // Guardar / actualizar.
  const parsed = mpSchema.safeParse({
    mp_access_token: formData.get('mp_access_token') ?? '',
    mp_public_key: formData.get('mp_public_key') ?? '',
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const e of parsed.error.errors) {
      const p = e.path.join('.');
      if (p) fieldErrors[p] = e.message;
    }
    return { ok: false, message: 'Revisá las credenciales.', fieldErrors };
  }

  // Validación REAL contra MercadoPago antes de persistir (evita guardar un
  // token con typo / revocado que rompería el checkout más tarde).
  const check = await validateMercadoPagoToken(parsed.data.mp_access_token);
  if (!check.ok) {
    return { ok: false, message: check.error ?? 'El access token no es válido.', fieldErrors: { mp_access_token: 'Inválido' } };
  }

  const { error } = await admin.rpc('set_brand_mp_credentials', {
    p_brand_id: brandId,
    p_access_token: parsed.data.mp_access_token,
    p_public_key: parsed.data.mp_public_key,
    p_encryption_key: serverEnv.BRAND_CREDS_ENCRYPTION_KEY,
  });
  if (error) return { ok: false, message: error.message };

  await admin.from('events_log').insert({
    brand_id: brandId,
    actor_user_id: user.id,
    type: 'brand_mp_credentials_updated',
    payload: {}, // NUNCA logueamos el token
  });

  revalidatePath('/admin/settings');
  return { ok: true, message: 'Credenciales de MercadoPago validadas y guardadas. Ya podés cobrar con tarjeta.' };
}
