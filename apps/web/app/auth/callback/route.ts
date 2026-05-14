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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = sanitizeNext(url.searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent('Link inválido o expirado.')}`,
        req.url
      )
    );
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, req.url)
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
