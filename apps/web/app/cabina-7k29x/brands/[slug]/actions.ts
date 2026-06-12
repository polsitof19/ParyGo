'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';
import { uploadBrandLogo, LOGO_ACCEPTED_MIME } from '@/lib/brandAssets';

export type InviteState = {
  ok: boolean;
  message: string | null;
};

export type SetBrandPwdState = { ok: boolean; message: string | null };

const setPwdSchema = z.object({
  brand_id: z.string().uuid(),
  user_id: z.string().uuid(),
  password: z.string().min(8, 'Mínimo 8 caracteres.'),
});

// Super admin sets a brand_admin's password (target must be brand_admin of
// that brand). El super admin también entra con email+contraseña; su password
// se gestiona desde el dashboard de Supabase, no desde acá.
export async function setBrandAdminPasswordAction(
  _prev: SetBrandPwdState,
  formData: FormData
): Promise<SetBrandPwdState> {
  await requireSession({ superAdmin: true });
  const parsed = setPwdSchema.safeParse({
    brand_id: formData.get('brand_id'),
    user_id: formData.get('user_id'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.errors[0]?.message ?? 'Datos inválidos.' };

  const admin = createAdminClient();
  const { data: m } = await admin
    .from('brand_members')
    .select('id').eq('brand_id', parsed.data.brand_id).eq('user_id', parsed.data.user_id).eq('role', 'brand_admin')
    .maybeSingle();
  if (!m) return { ok: false, message: 'Ese usuario no es admin de esta marca.' };

  const { error } = await admin.auth.admin.updateUserById(parsed.data.user_id, {
    password: parsed.data.password, email_confirm: true,
  });
  if (error) return { ok: false, message: 'No se pudo actualizar la contraseña.' };

  revalidatePath(`/cabina-7k29x/brands/${formData.get('slug') ?? ''}`);
  return { ok: true, message: 'Contraseña actualizada.' };
}

export type PackState = {
  ok: boolean;
  message: string | null;
};

// Pack → events added + price (price is informational, logged for audit).
const PACKS: Record<number, { added: number; price: number }> = {
  1: { added: 1, price: 200 },
  3: { added: 3, price: 540 },
  5: { added: 5, price: 850 },
  10: { added: 10, price: 1500 },
};

export async function loadPackAction(
  _prev: PackState,
  formData: FormData
): Promise<PackState> {
  const user = await requireSession({ superAdmin: true });

  const brandId = String(formData.get('brand_id') ?? '');
  const pack = Number(formData.get('pack'));
  const cfg = PACKS[pack];
  if (!brandId || !cfg) {
    return { ok: false, message: 'Pack inválido.' };
  }

  const admin = createAdminClient();
  const { data: newBalance, error } = await admin.rpc('load_event_pack', {
    p_brand_id: brandId,
    p_pack: pack,
    p_added: cfg.added,
    p_price_soles: cfg.price,
    p_actor_user_id: user.id,
  });
  if (error || newBalance == null) {
    return { ok: false, message: error?.message ?? 'No se pudo cargar el pack.' };
  }

  revalidatePath('/cabina-7k29x/brands');
  revalidatePath(`/cabina-7k29x/brands/${formData.get('slug') ?? ''}`);
  return {
    ok: true,
    message: `Pack ${pack} cargado (+${cfg.added}). Nuevo saldo: ${newBalance} evento${newBalance === 1 ? '' : 's'}.`,
  };
}

// ============================================================================
// Branding de una marca existente (super admin). Potestad total: puede editar el
// branding de CUALQUIER marca. Seguridad:
//  - Lockdown: SOLO super admin (requireSession superAdmin).
//  - El slug del path de storage sale del ROW cargado por brand_id (DB,
//    server-trusted), NUNCA del form → no inyectable a otra marca.
//  - Logo: tipo/tamaño validados + nombre server-generado (uploadBrandLogo).
//  - Solo toca theme_json (branding). NO toca saldo/dinero/eventos.
//  - El dueño CONSERVA su capacidad de editar su branding desde /admin.
// ============================================================================
export type BrandingState = {
  ok: boolean;
  message: string | null;
  fieldErrors?: Partial<Record<string, string>>;
};

const LOGO_MAX = 10 * 1024 * 1024;

const brandingSchema = z.object({
  brand_id: z.string().uuid(),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido'),
});

export async function updateBrandBrandingAction(
  _prev: BrandingState,
  formData: FormData
): Promise<BrandingState> {
  await requireSession({ superAdmin: true });

  const parsed = brandingSchema.safeParse({
    brand_id: formData.get('brand_id'),
    primary_color: formData.get('primary_color') ?? '',
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

  // El slug viene del ROW (no del form) → el path de storage no es inyectable.
  const { data: brand, error: brandErr } = await admin
    .from('brands')
    .select('id, slug, theme_json')
    .eq('id', parsed.data.brand_id)
    .single();
  if (brandErr || !brand) {
    return { ok: false, message: 'No se encontró la marca.' };
  }

  const theme = (brand.theme_json ?? {}) as Record<string, unknown>;
  let logoUrl = (theme.logo_url as string | undefined) ?? null;

  // Logo opcional: validar tipo/tamaño y subir bajo el prefijo de ESTA marca.
  const logoFile = formData.get('logo');
  if (logoFile instanceof File && logoFile.size > 0) {
    if (!LOGO_ACCEPTED_MIME.includes(logoFile.type)) {
      return { ok: false, message: 'El logo debe ser PNG, JPG o WEBP.', fieldErrors: { logo: 'Tipo no permitido' } };
    }
    if (logoFile.size > LOGO_MAX) {
      return { ok: false, message: 'El logo supera 10 MB.', fieldErrors: { logo: 'Muy grande' } };
    }
    const up = await uploadBrandLogo(admin, brand.slug, logoFile);
    if (!up.ok) return { ok: false, message: up.message };
    logoUrl = up.url;
  }

  const nextTheme = {
    ...theme,
    primary_color: parsed.data.primary_color,
    logo_url: logoUrl,
  };

  const { error: updErr } = await admin
    .from('brands')
    .update({ theme_json: nextTheme })
    .eq('id', brand.id);
  if (updErr) return { ok: false, message: updErr.message };

  await admin.from('events_log').insert({
    brand_id: brand.id,
    type: 'brand_branding_updated',
    payload: { by: 'super_admin', slug: brand.slug, logo_changed: Boolean(logoFile instanceof File && logoFile.size > 0), primary_color: parsed.data.primary_color },
  });

  revalidatePath(`/cabina-7k29x/brands/${brand.slug}`);
  return { ok: true, message: 'Branding actualizado. Ya está en vivo en la página de la marca.' };
}

// ============================================================================
// Datos de la marca (super admin): nombre, email, whatsapp, Yape. Seguridad:
//  - Lockdown: SOLO super admin (requireSession superAdmin) — escritura sobre
//    CUALQUIER marca, igual que el branding.
//  - NO toca: slug (rompería el subdominio), credenciales MP (las maneja el
//    dueño desde /admin, encriptadas), theme_json (branding), event_balance.
//  - El dueño CONSERVA updateBrandSettingsAction (scoped a SU marca por sesión);
//    esa invariante "el brand sale de la sesión, nunca del form" queda intacta.
// ============================================================================
export type BrandBasicsState = {
  ok: boolean;
  message: string | null;
  fieldErrors?: Partial<Record<string, string>>;
};

const brandBasicsSchema = z.object({
  brand_id: z.string().uuid(),
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120),
  contact_email: z.string().email('Email inválido').optional().or(z.literal('')),
  whatsapp_e164: z.string().regex(/^\+\d{8,15}$/, 'Formato +51999000111').optional().or(z.literal('')),
  yape_number: z.string().max(20).optional().or(z.literal('')),
  yape_holder: z.string().max(120).optional().or(z.literal('')),
});

export async function updateBrandBasicsAction(
  _prev: BrandBasicsState,
  formData: FormData
): Promise<BrandBasicsState> {
  const user = await requireSession({ superAdmin: true });

  const parsed = brandBasicsSchema.safeParse({
    brand_id: formData.get('brand_id'),
    name: formData.get('name') ?? '',
    contact_email: formData.get('contact_email') ?? '',
    whatsapp_e164: formData.get('whatsapp_e164') ?? '',
    yape_number: formData.get('yape_number') ?? '',
    yape_holder: formData.get('yape_holder') ?? '',
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
  const { data: brand, error: brandErr } = await admin
    .from('brands')
    .select('id, slug')
    .eq('id', parsed.data.brand_id)
    .single();
  if (brandErr || !brand) return { ok: false, message: 'No se encontró la marca.' };

  const { error: updErr } = await admin
    .from('brands')
    .update({
      name: parsed.data.name,
      contact_email: parsed.data.contact_email || null,
      whatsapp_e164: parsed.data.whatsapp_e164 || null,
      yape_number: parsed.data.yape_number || null,
      yape_holder: parsed.data.yape_holder || null,
    })
    .eq('id', brand.id);
  if (updErr) return { ok: false, message: updErr.message };

  await admin.from('events_log').insert({
    brand_id: brand.id,
    actor_user_id: user.id,
    type: 'brand_basics_updated',
    payload: { by: 'super_admin', slug: brand.slug },
  });

  revalidatePath(`/cabina-7k29x/brands/${brand.slug}`);
  revalidatePath('/cabina-7k29x/brands');
  return { ok: true, message: 'Datos de la marca actualizados.' };
}

// ============================================================================
// Archivar / desarchivar marca (SOLO super admin). Archivar = ocultar reversible:
// apaga el subdominio público (home + checkout 404) y manda la marca a la sección
// "Archivadas" de la cabina. El saldo y TODO el historial quedan intactos.
// ============================================================================
export async function setBrandArchivedAction(
  brandId: string,
  archived: boolean
): Promise<{ ok: boolean; message?: string }> {
  const user = await requireSession({ superAdmin: true });
  if (!brandId) return { ok: false, message: 'Marca inválida.' };

  const admin = createAdminClient();
  const { data: brand } = await admin.from('brands').select('id, slug').eq('id', brandId).maybeSingle();
  if (!brand) return { ok: false, message: 'Marca no encontrada.' };

  const { error } = await admin
    .from('brands')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', brandId);
  if (error) return { ok: false, message: error.message };

  await admin.from('events_log').insert({
    brand_id: brandId, actor_user_id: user.id,
    type: archived ? 'brand_archived' : 'brand_unarchived', payload: { slug: brand.slug },
  });
  revalidatePath('/cabina-7k29x');
  revalidatePath('/cabina-7k29x/brands');
  revalidatePath(`/cabina-7k29x/brands/${brand.slug}`);
  return { ok: true };
}

// ============================================================================
// Borrado PERMANENTE de marca — SOLO super admin y SOLO si está VACÍA (0 eventos,
// 0 órdenes, 0 tickets). Cualquier cosa con historial NO se borra (la DB además
// lo bloquea por RESTRICT): hay que archivar. Confirmación por nombre. Limpia el
// storage de la marca (logos/flyers). Cascada DB: brand_members, validator_codes.
// ============================================================================
export async function deleteBrandAction(
  brandId: string,
  confirmName: string
): Promise<{ ok: boolean; message?: string }> {
  const user = await requireSession({ superAdmin: true });
  const admin = createAdminClient();
  const { data: brand } = await admin.from('brands').select('id, slug, name').eq('id', brandId).maybeSingle();
  if (!brand) return { ok: false, message: 'Marca no encontrada.' };
  if ((confirmName ?? '').trim() !== brand.name) {
    return { ok: false, message: 'El nombre no coincide. Escribilo igual para confirmar.' };
  }

  const [{ count: events }, { count: orders }, { count: tickets }] = await Promise.all([
    admin.from('events').select('id', { count: 'exact', head: true }).eq('brand_id', brandId),
    admin.from('orders').select('id', { count: 'exact', head: true }).eq('brand_id', brandId),
    admin.from('tickets').select('id', { count: 'exact', head: true }).eq('brand_id', brandId),
  ]);
  if ((orders ?? 0) > 0 || (tickets ?? 0) > 0) {
    return { ok: false, message: 'No se puede eliminar: tiene ventas. Archivá en su lugar.' };
  }
  if ((events ?? 0) > 0) {
    return { ok: false, message: 'Borrá o archivá sus eventos primero (la marca tiene eventos).' };
  }

  await admin.from('events_log').insert({
    brand_id: brandId, actor_user_id: user.id, type: 'brand_deleted', payload: { slug: brand.slug, name: brand.name },
  });

  const { error } = await admin.from('brands').delete().eq('id', brandId);
  if (error) return { ok: false, message: error.message };

  // Limpiar el storage de la marca (logos/flyers) — best-effort.
  const { data: objs } = await admin.storage.from('brand-assets').list(brand.slug);
  if (objs && objs.length) {
    await admin.storage.from('brand-assets').remove(objs.map((o) => `${brand.slug}/${o.name}`));
  }

  revalidatePath('/cabina-7k29x');
  revalidatePath('/cabina-7k29x/brands');
  return { ok: true };
}

// ============================================================================
// Quitar un admin de una marca (SOLO super admin). La guarda del "último admin"
// es ATÓMICA en el RPC remove_brand_admin (FOR UPDATE + recuento): nunca deja la
// marca sin admin. Solo quita la membresía; no borra el usuario de auth.
// ============================================================================
export type RemoveAdminState = { ok: boolean; message?: string };

export async function removeBrandAdminAction(
  brandId: string,
  userId: string
): Promise<RemoveAdminState> {
  const user = await requireSession({ superAdmin: true });
  if (!brandId || !userId) return { ok: false, message: 'Datos inválidos.' };

  const admin = createAdminClient();
  // Email del target (para el log) antes de quitarlo.
  const { data: target } = await admin
    .from('brand_members')
    .select('display_name')
    .eq('brand_id', brandId).eq('user_id', userId).eq('role', 'brand_admin')
    .maybeSingle();

  const { data: res, error } = await admin.rpc('remove_brand_admin', {
    p_brand_id: brandId,
    p_user_id: userId,
  });
  if (error) return { ok: false, message: error.message };
  const r = (res ?? {}) as { ok?: boolean; reason?: string };
  if (!r.ok) {
    if (r.reason === 'LAST_ADMIN') return { ok: false, message: 'No puedes quitar al único admin. Asigna otro antes.' };
    if (r.reason === 'NOT_ADMIN') return { ok: false, message: 'Ese usuario ya no es admin de esta marca.' };
    return { ok: false, message: 'No se pudo quitar el admin.' };
  }

  const { data: brand } = await admin.from('brands').select('slug').eq('id', brandId).maybeSingle();
  await admin.from('events_log').insert({
    brand_id: brandId, actor_user_id: user.id, type: 'brand_admin_removed',
    payload: { removed_user_id: userId, removed_email: target?.display_name ?? null },
  });
  revalidatePath(`/cabina-7k29x/brands/${brand?.slug ?? ''}`);
  return { ok: true };
}

const schema = z.object({
  brand_id: z.string().uuid(),
  email: z.string().email(),
});

export async function inviteBrandAdminAction(
  _prev: InviteState,
  formData: FormData
): Promise<InviteState> {
  await requireSession({ superAdmin: true });

  const parsed = schema.safeParse({
    brand_id: formData.get('brand_id'),
    email: formData.get('email'),
  });
  if (!parsed.success) {
    return { ok: false, message: 'Email inválido.' };
  }

  const admin = createAdminClient();

  // 1) Send magic link / invite. Supabase will create the auth user if needed.
  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email,
    {
      redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/admin`,
    }
  );

  if (inviteErr && inviteErr.message?.toLowerCase().includes('already')) {
    // User already exists — fetch by email instead.
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = list?.users.find((u) => u.email?.toLowerCase() === parsed.data.email.toLowerCase());
    if (!existing) {
      return { ok: false, message: 'Usuario existe pero no se pudo localizar.' };
    }
    return await attach(admin, parsed.data.brand_id, existing.id, parsed.data.email);
  }
  if (inviteErr || !inviteData?.user) {
    return { ok: false, message: inviteErr?.message ?? 'No se pudo invitar.' };
  }

  return await attach(admin, parsed.data.brand_id, inviteData.user.id, parsed.data.email);
}

async function attach(
  admin: ReturnType<typeof createAdminClient>,
  brandId: string,
  userId: string,
  email: string
): Promise<InviteState> {
  // Insert brand_member with role brand_admin. Upsert in case of retry.
  const { error: memberErr } = await admin
    .from('brand_members')
    .upsert(
      {
        brand_id: brandId,
        user_id: userId,
        role: 'brand_admin',
        display_name: email,
      },
      { onConflict: 'brand_id,user_id' }
    );
  if (memberErr) {
    return { ok: false, message: memberErr.message };
  }
  await admin.from('events_log').insert({
    brand_id: brandId,
    actor_user_id: userId,
    type: 'brand_admin_invited',
    payload: { email },
  });
  revalidatePath(`/cabina-7k29x/brands`);
  return { ok: true, message: `Invitación enviada a ${email}.` };
}
