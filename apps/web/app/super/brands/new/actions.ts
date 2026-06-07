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
      message: 'Revisa los campos marcados.',
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
    // The generated types declare the RPC args as non-null strings, but the
    // underlying plpgsql function treats null as "clear the credential".
    // Cast through unknown to keep the null semantic without lying about it.
    const { error: rpcErr } = await admin.rpc('set_brand_mp_credentials', {
      p_brand_id: brand.id,
      p_access_token: parsed.data.mp_access_token || (null as unknown as string),
      p_public_key: parsed.data.mp_public_key || (null as unknown as string),
      p_encryption_key: serverEnv.BRAND_CREDS_ENCRYPTION_KEY,
    });
    if (rpcErr) {
      // Brand was created but creds failed — surface the issue, brand still usable for Yape.
      revalidatePath('/super/brands');
      return {
        ok: false,
        message: `Marca creada pero las credenciales MP fallaron: ${rpcErr.message}. Prueba guardarlas desde la página de la marca.`,
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

// ============================================================================
// Orquestación marca + dueño (un solo paso). NO toca saldo/dinero: el saldo se
// carga aparte con load_event_pack desde la vista de la marca.
//
// Seguridad (blindado a propósito):
//  - Lockdown: SOLO super admin (requireSession superAdmin). Mismo gate que el
//    resto de acciones de /super.
//  - El dueño se crea con el rol correcto SOLO vía brand_members (role
//    'brand_admin') para ESTA marca. Nunca toca user_profiles.is_super_admin
//    (no escala a super admin) ni inserta membresías de otras marcas (no escala
//    lateralmente).
//  - Si el email ya existe NO seteamos su contraseña (evita pisar la cuenta de
//    un super admin u otro dueño): se rechaza y se deriva al flujo de la marca.
//  - Rollback all-or-nothing: si falla crear usuario o membresía, se borra lo
//    creado para no dejar marca huérfana ni usuario sin marca.
// ============================================================================
const ownerSchema = z.object({
  name: z.string().min(2).max(60),
  slug: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/, 'Solo minúsculas, números y guiones'),
  owner_email: z.string().email('Email inválido.'),
  owner_password: z.string().min(8, 'Mínimo 8 caracteres.').max(72),
});

export async function createBrandWithOwnerAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  // Lockdown: solo super admin puede orquestar marca + dueño.
  await requireSession({ superAdmin: true });

  const parsed = ownerSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    owner_email: formData.get('owner_email'),
    owner_password: formData.get('owner_password'),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const err of parsed.error.errors) {
      const path = err.path.join('.');
      if (path) fieldErrors[path] = err.message;
    }
    return { ok: false, message: 'Revisa los campos marcados.', fieldErrors };
  }

  if (RESERVED.has(parsed.data.slug)) {
    return { ok: false, message: 'Ese slug está reservado.', fieldErrors: { slug: 'Reservado' } };
  }

  const admin = createAdminClient();
  const email = parsed.data.owner_email.trim().toLowerCase();

  // Rollback helper con chequeo: un rollback fallido NO debe ser silencioso
  // (la garantía all-or-nothing tiene que ser visible si se rompe).
  async function rollback(userId: string | null, brandId: string | null) {
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) console.error('[createBrandWithOwner] rollback deleteUser falló', userId, error.message);
    }
    if (brandId) {
      const { error } = await admin.from('brands').delete().eq('id', brandId);
      if (error) console.error('[createBrandWithOwner] rollback delete brand falló', brandId, error.message);
    }
  }

  // Paso 1: crear el usuario dueño CON contraseña (confirmado, sin magic link).
  // createUser es la guardia ATÓMICA de unicidad de email: si ya existe, falla
  // acá (no lo creamos de nuevo ni pisamos su contraseña). Lo hacemos PRIMERO
  // para que, ante un email repetido, no haya que rollbackear una marca.
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password: parsed.data.owner_password,
    email_confirm: true,
  });
  if (userErr || !created?.user) {
    const raw = userErr?.message?.toLowerCase() ?? '';
    if (raw.includes('already') || raw.includes('registered') || raw.includes('exist')) {
      return {
        ok: false,
        message: 'Ya existe un usuario con ese email. Creá la marca y asignalo como dueño desde la vista de la marca.',
        fieldErrors: { owner_email: 'Email ya registrado' },
      };
    }
    console.error('[createBrandWithOwner] createUser falló', userErr?.message);
    return { ok: false, message: 'No se pudo crear el usuario dueño.' };
  }

  const webhookSecret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const themeJson = { primary_color: '#FF1F8F', secondary_color: '#00E5FF' };

  // Paso 2: insertar la marca.
  const { data: brand, error: insertErr } = await admin
    .from('brands')
    .insert({
      slug: parsed.data.slug,
      name: parsed.data.name,
      contact_email: email,
      theme_json: themeJson,
      mp_webhook_secret: webhookSecret,
    })
    .select('id, slug')
    .single();

  if (insertErr || !brand) {
    // Rollback: borrar el usuario recién creado (todavía no hay marca).
    await rollback(created.user.id, null);
    if (insertErr?.code === '23505') {
      return { ok: false, message: 'Ya existe una marca con ese slug.', fieldErrors: { slug: 'En uso' } };
    }
    console.error('[createBrandWithOwner] insert brand falló', insertErr?.message);
    return { ok: false, message: 'No se pudo crear la marca.' };
  }

  // Paso 3: asignar membresía brand_admin SOLO para esta marca.
  const { error: memberErr } = await admin.from('brand_members').insert({
    brand_id: brand.id,
    user_id: created.user.id,
    role: 'brand_admin',
    display_name: email,
  });
  if (memberErr) {
    // Rollback total: borrar usuario y marca.
    await rollback(created.user.id, brand.id);
    console.error('[createBrandWithOwner] insert membership falló', memberErr.message);
    return { ok: false, message: 'No se pudo asignar el dueño a la marca.' };
  }

  // Paso 4: auditoría (best-effort, no bloquea el alta).
  const { error: logErr } = await admin.from('events_log').insert([
    { brand_id: brand.id, type: 'brand_created', payload: { slug: brand.slug, name: parsed.data.name } },
    { brand_id: brand.id, actor_user_id: created.user.id, type: 'brand_admin_created', payload: { email } },
  ]);
  if (logErr) console.error('[createBrandWithOwner] events_log falló', logErr.message);

  revalidatePath('/super');
  revalidatePath('/super/brands');
  redirect(`/super/brands/${brand.slug}`);
}
