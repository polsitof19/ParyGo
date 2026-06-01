'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';

export type InviteValidatorState = { ok: boolean; message: string | null };

const schema = z.object({ email: z.string().email() });

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
