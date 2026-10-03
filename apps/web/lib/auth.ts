import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { esIdioma, type Idioma } from '@/lib/idioma';

export type SessionUser = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  // idioma = el de esa marca (0073), para el panel y el escáner.
  brandMemberships: { brandId: string; role: 'brand_admin' | 'validator'; idioma: Idioma }[];
};

// Cached per-request user lookup. Returns null if not authenticated.
// getUser() (verifica con Supabase) va EN PARALELO con el perfil y las
// membresías, que se piden con el id del token de la cookie: un viaje en vez
// de dos. Si getUser no confirma ESE mismo id, no hay sesión y lo leído se
// descarta; y las dos lecturas van con el JWT, que PostgREST valida igual.
const idDelToken = (jwt: string | undefined): string | null => {
  try {
    const p = jwt?.split('.')[1];
    return p ? (JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))).sub ?? null) : null;
  } catch {
    return null;
  }
};

// Membresías con el idioma de cada marca embebido (cero viajes extra). Si el
// embebido fallara (p. ej. falta el grant de la columna, como pasó con
// yape_qr_url), se reintenta sin idioma: perder el inglés es un detalle,
// quedarse sin membresías sería dejar a todos afuera del panel.
type Membresia = { brand_id: string; role: string; brand?: { idioma?: string } | null };
async function membresias(supabase: ReturnType<typeof createClient>, uid: string): Promise<{ data: Membresia[] | null }> {
  const r = await supabase.from('brand_members').select('brand_id, role, brand:brands ( idioma )').eq('user_id', uid);
  if (!r.error) return { data: r.data as unknown as Membresia[] };
  const sin = await supabase.from('brand_members').select('brand_id, role').eq('user_id', uid);
  return { data: (sin.data ?? null) as Membresia[] | null };
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = idDelToken(session?.access_token);
  if (!uid) return null;

  const [
    {
      data: { user },
    },
    { data: profile },
    { data: memberships },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('user_profiles').select('is_super_admin').eq('user_id', uid).maybeSingle(),
    membresias(supabase, uid),
  ]);
  if (!user || user.id !== uid) return null;

  return {
    id: user.id,
    email: user.email ?? '',
    isSuperAdmin: profile?.is_super_admin ?? false,
    brandMemberships: (memberships ?? []).map((m) => ({
      brandId: m.brand_id,
      role: m.role as 'brand_admin' | 'validator',
      idioma: esIdioma(m.brand?.idioma) ? (m.brand?.idioma as Idioma) : 'es',
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

// Where a freshly-authenticated user should land, by role. Mirrors the
// role-redirect in /auth/callback so password login and magic link agree.
export async function destinationForUser(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_super_admin')
    .eq('user_id', userId)
    .maybeSingle();
  if (profile?.is_super_admin) return '/cabina-7k29x';
  // Todas las membresías, y el organizador PRIMERO: con .limit(1) sin orden,
  // alguien que es organizador de una marca y validador de otra caía en un
  // destino al azar.
  const { data: memberships } = await supabase
    .from('brand_members')
    .select('role')
    .eq('user_id', userId);
  const roles = new Set((memberships ?? []).map((m) => m.role));
  if (roles.has('brand_admin')) return '/admin';
  if (roles.has('validator')) return '/scan';
  return '/';
}

export function whatsappNumberForSupport(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '56932881230';
}
