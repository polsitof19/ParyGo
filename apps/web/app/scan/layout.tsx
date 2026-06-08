import { redirect } from 'next/navigation';
import { LogOut, ScanLine } from 'lucide-react';
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ScanServiceWorker } from './ScanServiceWorker';
import './scan.css';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const bricolage = Bricolage_Grotesque({ weight: ['700', '800'], subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const hanken = Hanken_Grotesk({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-hanken', display: 'swap' });

export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const membership = user.brandMemberships.find(
    (m) => m.role === 'validator' || m.role === 'brand_admin'
  );
  if (!membership) {
    redirect(user.isSuperAdmin ? '/cabina-7k29x' : '/login?error=' + encodeURIComponent('Acceso solo para staff de puerta.'));
  }

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('name')
    .eq('id', membership.brandId)
    .maybeSingle();

  return (
    <div className={`scan-shell ${bricolage.variable} ${hanken.variable}`}>
      <ScanServiceWorker />
      <header className="k-header">
        <div className="k-header__in">
          <span className="k-brand">
            <ScanLine className="h-5 w-5" />
            {brand?.name ?? 'Puerta'}
            <span className="k-tag">Puerta</span>
          </span>
          <form action="/auth/logout" method="post">
            <button type="submit" aria-label="Cerrar sesión" className="k-logout"><LogOut className="h-4 w-4" /></button>
          </form>
        </div>
      </header>
      <main className="k-wrap">{children}</main>
    </div>
  );
}
