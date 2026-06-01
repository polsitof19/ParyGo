import { redirect } from 'next/navigation';
import { LogOut, ScanLine } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const membership = user.brandMemberships.find(
    (m) => m.role === 'validator' || m.role === 'brand_admin'
  );
  if (!membership) {
    redirect(user.isSuperAdmin ? '/super' : '/login?error=' + encodeURIComponent('Acceso solo para staff de puerta.'));
  }

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('name')
    .eq('id', membership.brandId)
    .maybeSingle();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="container flex h-14 items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 font-display text-lg uppercase tracking-tight">
            <ScanLine className="h-5 w-5 text-secondary" />
            {brand?.name ?? 'Puerta'}
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-secondary">[ PUERTA ]</span>
          </span>
          <form action="/auth/logout" method="post">
            <button type="submit" aria-label="Cerrar sesión" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </header>
      <main className="container max-w-lg flex-1 py-6">{children}</main>
    </div>
  );
}
