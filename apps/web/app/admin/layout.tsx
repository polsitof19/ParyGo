import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: 'Resumen' },
  { href: '/admin/yape', label: 'Yape pending' },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  // Super admin bypasses this layout (goes to /super); brand_admin uses it.
  if (user.isSuperAdmin) redirect('/super');
  const brandMembership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!brandMembership) {
    redirect('/login?error=' + encodeURIComponent('No tenés acceso de promotor.'));
  }

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('slug, name')
    .eq('id', brandMembership.brandId)
    .maybeSingle();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <Link
              href="/admin"
              className="font-display text-xl uppercase tracking-tight"
            >
              {brand?.name ?? 'Admin'}
              <span
                className="ml-1 inline-block h-1.5 w-1.5 -translate-y-1 rounded-full bg-primary align-middle"
                style={{ boxShadow: '0 0 8px hsl(var(--primary))' }}
              />
            </Link>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-secondary md:inline">
              [ BRAND ADMIN ]
            </span>
          </div>
          <nav className="hidden items-center gap-6 font-mono text-xs uppercase tracking-[0.18em] md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground md:inline">
              {user.email}
            </span>
            <form action="/auth/logout" method="post">
              <button
                type="submit"
                aria-label="Cerrar sesión"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="container flex-1 py-8">{children}</main>
    </div>
  );
}
