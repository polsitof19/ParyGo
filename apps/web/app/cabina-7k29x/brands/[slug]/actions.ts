'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';

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
// that brand). Super admin itself stays on magic link (never gets a password).
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
