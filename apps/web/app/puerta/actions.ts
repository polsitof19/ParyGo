'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type RedeemState = { ok: boolean; message: string | null };

function clientIp(): string {
  const h = headers();
  return (
    h.get('cf-connecting-ip') ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'unknown'
  );
}

export async function redeemGateCodeAction(
  _prev: RedeemState,
  formData: FormData
): Promise<RedeemState> {
  const code = String(formData.get('code') ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
  if (code.length !== 8) return { ok: false, message: 'Ingresá el código de 8 caracteres.' };

  const admin = createAdminClient();

  // Rate-limit redemption by IP (brute-force of the code space).
  const { data: rl } = await admin.rpc('check_and_record_auth_attempt', {
    p_kind: 'redeem', p_identifier: null, p_ip: clientIp(),
    p_max_per_id: 999, p_max_per_ip: 10, p_window_minutes: 15,
  });
  if ((rl as { blocked?: boolean } | null)?.blocked) {
    return { ok: false, message: 'Demasiados intentos. Esperá unos minutos.' };
  }

  // 1) Atomic redeem (validates + bumps use_count). The code IS the credential.
  const { data, error } = await admin.rpc('redeem_validator_code', { p_code: code });
  const res = data as { ok?: boolean; user_id?: string } | null;
  if (error || !res?.ok || !res.user_id) {
    return { ok: false, message: 'Código inválido o vencido.' };
  }

  // 2) Mint a session for the puesto user WITHOUT sending email, and set the
  //    SSR auth cookie by verifying the OTP token on the server client.
  const { data: u } = await admin.auth.admin.getUserById(res.user_id);
  const email = u?.user?.email;
  if (!email) return { ok: false, message: 'Puesto no encontrado.' };

  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link?.properties?.hashed_token;
  if (lErr || !tokenHash) return { ok: false, message: 'No se pudo iniciar sesión. Reintentá.' };

  const supabase = createClient(); // @supabase/ssr → writes sb-* auth cookies
  const { error: vErr } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
  if (vErr) return { ok: false, message: 'No se pudo iniciar sesión. Reintentá.' };

  redirect('/scan');
}
