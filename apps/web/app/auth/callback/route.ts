import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Magic-link callback. Supabase OTP redirects here with ?code=...
// We exchange it for a session cookie and bounce to ?next=.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

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

  // Decide destination by role. Server reads profile + memberships.
  let destination = next;
  if (next === '/' || next === '') {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
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
  }

  return NextResponse.redirect(new URL(destination, req.url));
}
