'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';

export type InviteValidatorState = { ok: boolean; message: string | null };
export type GateCodeState = { ok: boolean; message: string | null; code?: string; label?: string };

const schema = z.object({ email: z.string().email() });

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'puesto';

// brand_admin generates a 6-digit door code bound to an ephemeral "puesto"
// validator user of THEIR brand (brand from session, never the form).
export async function generateGateCodeAction(
  _prev: GateCodeState,
  formData: FormData
): Promise<GateCodeState> {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) return { ok: false, message: 'No tenés acceso de promotor.' };
  const brandId = membership.brandId;
  const label = (String(formData.get('device_label') ?? '').trim() || 'Puerta').slice(0, 40);

  const admin = createAdminClient();
  const email = `gate-${brandId.slice(0, 8)}-${slugify(label)}@gate.parygo.local`;

  let userId: string | undefined;
  const created = await admin.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { gate: true, brand_id: brandId, label },
  });
  if (created.data?.user) userId = created.data.user.id;
  else {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
  }
  if (!userId) return { ok: false, message: 'No se pudo crear el puesto.' };

  await admin.from('user_profiles').upsert({ user_id: userId, is_super_admin: false, display_name: label }, { onConflict: 'user_id' });
  // ENFORCEMENT: the puesto user is ALWAYS a validator of this brand, never more.
  await admin.from('brand_members').upsert({ brand_id: brandId, user_id: userId, role: 'validator', display_name: label }, { onConflict: 'brand_id,user_id' });

  const { data, error } = await admin.rpc('generate_validator_code', {
    p_brand_id: brandId, p_user_id: userId, p_device_label: label, p_created_by: user.id,
    p_ttl_minutes: 720, p_max_uses: 200,
  });
  const res = data as { ok?: boolean; code?: string } | null;
  if (error || !res?.ok || !res.code) return { ok: false, message: error?.message ?? 'No se pudo generar el código.' };

  revalidatePath('/admin');
  return { ok: true, code: res.code, label, message: `Código para "${label}": ${res.code}` };
}

export async function revokeGateCodeAction(
  _prev: GateCodeState,
  formData: FormData
): Promise<GateCodeState> {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) return { ok: false, message: 'No autorizado.' };
  const id = String(formData.get('code_id') ?? '');
  const admin = createAdminClient();
  // Scoped to the admin's brand inside the RPC (p_brand_id from session).
  await admin.rpc('revoke_validator_code', { p_id: id, p_brand_id: membership.brandId });
  revalidatePath('/admin');
  return { ok: true, message: 'Código revocado.' };
}

export async function inviteValidatorAction(
  _prev: InviteValidatorState,
  formData: FormData
): Promise<InviteValidatorState> {
  const user = await requireSession();
  // ENFORCEMENT: brand from the session, never the form. A brand_admin can only
  // add validators to THEIR OWN brand.
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) return { ok: false, message: 'No tenés acceso de promotor.' };
  const brandId = membership.brandId;

  const parsed = schema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { ok: false, message: 'Email inválido.' };
  const email = parsed.data.email;

  const admin = createAdminClient();

  // Invite (creates the auth user if needed); validators land on /scan.
  const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/scan`,
  });

  let userId: string | undefined;
  if (inviteErr && inviteErr.message?.toLowerCase().includes('already')) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    if (!userId) return { ok: false, message: 'El usuario existe pero no se pudo localizar.' };
  } else if (inviteErr || !invite?.user) {
    return { ok: false, message: inviteErr?.message ?? 'No se pudo invitar.' };
  } else {
    userId = invite.user.id;
  }

  const { error: memberErr } = await admin
    .from('brand_members')
    .upsert(
      { brand_id: brandId, user_id: userId, role: 'validator', display_name: email },
      { onConflict: 'brand_id,user_id' }
    );
  if (memberErr) return { ok: false, message: memberErr.message };

  await admin.from('events_log').insert({
    brand_id: brandId,
    actor_user_id: user.id,
    type: 'validator_invited',
    payload: { email },
  });

  revalidatePath('/admin');
  return { ok: true, message: `Validador invitado: ${email}. Recibe un link para entrar al escáner.` };
}
