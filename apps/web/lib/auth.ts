import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type SessionUser = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  brandMemberships: { brandId: string; role: 'brand_admin' | 'validator' }[];
};

// Cached per-request user lookup. Returns null if not authenticated.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('user_profiles').select('is_super_admin').eq('user_id', user.id).maybeSingle(),
    supabase.from('brand_members').select('brand_id, role').eq('user_id', user.id),
  ]);

  return {
    id: user.id,
    email: user.email ?? '',
    isSuperAdmin: profile?.is_super_admin ?? false,
    brandMemberships: (memberships ?? []).map((m) => ({
      brandId: m.brand_id as string,
      role: m.role as 'brand_admin' | 'validator',
    })),
  };
});

// Server Component guard: requires authenticated user. Optionally enforces
// super_admin or membership of a specific brand with a specific role.
export async function requireSession(opts?: {
  superAdmin?: boolean;
  brandId?: string;
  brandRole?: 'brand_admin' | 'validator';
}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (opts?.superAdmin && !user.isSuperAdmin) {
    redirect('/login?error=' + encodeURIComponent('Acceso restringido.'));
  }
  if (opts?.brandId) {
    const allowed =
      user.isSuperAdmin ||
      user.brandMemberships.some(
        (m) =>
          m.brandId === opts.brandId &&
          (!opts.brandRole || m.role === opts.brandRole)
      );
    if (!allowed) redirect('/login?error=' + encodeURIComponent('Acceso restringido.'));
  }

  return user;
}

export function whatsappNumberForSupport(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '56932881230';
}
