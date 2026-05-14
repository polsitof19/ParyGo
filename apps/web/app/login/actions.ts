'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';

export type LoginState = {
  ok: boolean;
  message: string | null;
};

const schema = z.object({
  email: z.string().email('Email inválido'),
  next: z.string().optional().nullable(),
});

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    next: formData.get('next') || null,
  });
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { ok: false, message: first?.message ?? 'Datos inválidos' };
  }

  const supabase = createClient();
  // Always send the user back to /auth/callback which handles the code exchange
  // and then redirects to ?next= (defaults to /).
  const origin = headers().get('origin') ?? publicEnv.NEXT_PUBLIC_APP_URL;
  const next = parsed.data.next ? `?next=${encodeURIComponent(parsed.data.next)}` : '';
  const emailRedirectTo = `${origin}/auth/callback${next}`;

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo,
      // We allow user creation on first login. Restrict to super_admin email
      // and pre-invited brand_admins via downstream role checks.
      shouldCreateUser: true,
    },
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: parsed.data.email };
}
