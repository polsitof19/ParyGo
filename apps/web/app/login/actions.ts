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

// Compact, leak-safe error description. We strip noisy bits that don't help
// the user (stack trace headers, surrounding quotes) but keep the message.
function describeError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'unknown error';
  }
}

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  // We wrap the whole handler so any exception thrown by Supabase / edge
  // runtime reaches the user as a typed LoginState instead of falling through
  // to /app/error.tsx. Each stage logs to console.error so it shows up in
  // Cloudflare Pages Functions logs.
  let stage: 'parse' | 'client' | 'origin' | 'otp' | 'unknown' = 'unknown';
  try {
    stage = 'parse';
    const parsed = schema.safeParse({
      email: formData.get('email'),
      next: formData.get('next') || null,
    });
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      return { ok: false, message: first?.message ?? 'Datos inválidos' };
    }

    stage = 'client';
    const supabase = createClient();

    stage = 'origin';
    // Always send the user back to /auth/callback which handles the code
    // exchange and then redirects to ?next= (defaults to /).
    const origin =
      headers().get('origin') ||
      headers().get('referer')?.replace(/^(https?:\/\/[^/]+).*/, '$1') ||
      publicEnv.NEXT_PUBLIC_APP_URL;
    const next = parsed.data.next
      ? `?next=${encodeURIComponent(parsed.data.next)}`
      : '';
    const emailRedirectTo = `${origin}/auth/callback${next}`;

    stage = 'otp';
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
      console.error('[login] signInWithOtp returned error', {
        stage,
        error: error.message,
        status: error.status,
        emailRedirectTo,
      });
      return { ok: false, message: error.message };
    }
    return { ok: true, message: parsed.data.email };
  } catch (err) {
    const description = describeError(err);
    // Keep the structured log for Pages Functions; show the user just the
    // underlying message so the banner stays clean now that the bug surfaced.
    console.error('[login] sendMagicLink threw', {
      stage,
      error: description,
    });
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : 'No pudimos enviar el link. Intentá de nuevo.',
    };
  }
}
