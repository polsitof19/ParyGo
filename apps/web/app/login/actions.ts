'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { destinationForUser } from '@/lib/auth';

export type LoginState = {
  ok: boolean;
  message: string | null;
};

function clientIp(): string {
  const h = headers();
  return (
    h.get('cf-connecting-ip') ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'unknown'
  );
}

const GENERIC_LOGIN_ERROR = 'Email o contraseña incorrectos.';

// Login unificado: TODOS los roles entran con email + contraseña, incluido el
// super admin (antes usaba magic link). Sin ramas por rol → mismo error
// genérico para todos (anti-enumeración) + rate limit. La recuperación de
// contraseña se hace desde el dashboard de Supabase, no por magic link.
//
// Nota de seguridad: este módulo 'use server' NO debe exportar otros handlers
// de auth (p.ej. un sendMagicLink), porque todo export es un endpoint POST
// invocable que saltearía este rate-limit. El único punto de entrada de login
// es loginAction.
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, message: 'Email inválido.' };
  }

  const admin = createAdminClient();
  const { data: rl } = await admin.rpc('check_and_record_auth_attempt', {
    p_kind: 'login', p_identifier: email, p_ip: clientIp(),
    p_max_per_id: 5, p_max_per_ip: 5, p_window_minutes: 15,
  });
  if ((rl as { blocked?: boolean } | null)?.blocked) {
    return { ok: false, message: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.' };
  }

  // Contraseña obligatoria para TODOS los roles, incluido el super admin. Sin
  // contraseña → mismo error genérico (no se filtra cuál email es el super
  // admin). La recuperación de acceso se hace desde el dashboard de Supabase.
  if (!password) return { ok: false, message: GENERIC_LOGIN_ERROR };

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }

  await admin.rpc('clear_auth_attempts', { p_kind: 'login', p_identifier: email });
  redirect(await destinationForUser(supabase, data.user.id));
}
