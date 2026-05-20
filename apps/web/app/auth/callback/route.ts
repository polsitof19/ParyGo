import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';

export const runtime = 'edge';

// Magic-link callback. Supabase OTP redirects here with ?code=...
// We exchange it for a session cookie and bounce to ?next= by role.
// Reject anything that isn't a server-relative path. Blocks open redirect
// via `?next=//evil.com` (which `new URL(..., base)` would resolve to an
// off-host target).
function sanitizeNext(raw: string | null): string {
  if (!raw) return '';
  if (!raw.startsWith('/')) return '';
  if (raw.startsWith('//')) return '';
  return raw;
}

// Magic links default to the token_hash flow (verifyOtp). It works across
// browsers/devices because it doesn't depend on a PKCE cookie. The legacy
// `?code=` branch is retained so links generated before the template switch
// (in-flight emails, ~1h TTL) still resolve when clicked from the same
// browser that submitted /login.
type EmailOtpType = 'email' | 'magiclink' | 'recovery' | 'invite' | 'signup';
const ALLOWED_OTP_TYPES: ReadonlySet<EmailOtpType> = new Set([
  'email',
  'magiclink',
  'recovery',
  'invite',
  'signup',
]);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const rawType = url.searchParams.get('type');
  const next = sanitizeNext(url.searchParams.get('next'));

  if (!code && !tokenHash) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent('Link inválido o expirado.')}`,
        req.url
      )
    );
  }

  const supabase = createClient();

  let exchangeError: { message: string } | null = null;
  if (tokenHash) {
    if (!rawType || !ALLOWED_OTP_TYPES.has(rawType as EmailOtpType)) {
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent('Link inválido o expirado.')}`,
          req.url
        )
      );
    }
    const { error } = await supabase.auth.verifyOtp({
      type: rawType as EmailOtpType,
      token_hash: tokenHash,
    });
    exchangeError = error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    exchangeError = error;
  }

  if (exchangeError) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, req.url)
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent('Sesión no se pudo crear.')}`,
        req.url
      )
    );
  }

  // Bootstrap super admin: if the logged-in email matches SUPER_ADMIN_EMAIL,
  // promote the profile (idempotent). Only promote on emails that Supabase
  // has actually verified — otherwise an attacker who learns the configured
  // super-admin address could register it before the real owner does.
  if (
    user.email &&
    user.email_confirmed_at &&
    user.email.toLowerCase() === serverEnv.SUPER_ADMIN_EMAIL.toLowerCase()
  ) {
    const admin = createAdminClient();
    await admin
      .from('user_profiles')
      .upsert(
        {
          user_id: user.id,
          display_name: user.user_metadata?.display_name ?? user.email,
          is_super_admin: true,
        },
        { onConflict: 'user_id' }
      );
  }

  // Decide destination by role unless an explicit ?next was provided.
  let destination = next || '/';
  if (!next || next === '/') {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile?.is_super_admin) {
      destination = '/super';
    } else {
      const { data: membership } = await supabase
        .from('brand_members')
        .select('role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (membership?.role === 'brand_admin') destination = '/admin';
      else if (membership?.role === 'validator') destination = '/scan';
      else destination = '/';
    }
  }

  return NextResponse.redirect(new URL(destination, req.url));
}
