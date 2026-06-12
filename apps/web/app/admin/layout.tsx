import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createClient } from '@/lib/supabase/server';
import { AdminTopbar } from './AdminTopbar';
import { ImpersonationBanner } from './ImpersonationBanner';
import './admin.css';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Identidad cálida parygo, scopeada bajo .admin-shell (no afecta cabina/scan/landing).
const bricolage = Bricolage_Grotesque({
  weight: ['600', '700', '800'],
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
});
const hanken = Hanken_Grotesk({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
});

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  // Marca activa del panel: brand_admin → su marca; super admin con cookie de
  // impersonación → la marca que está VIENDO (solo lectura). Un super admin SIN
  // impersonar va a su cabina.
  const ctx = ownerBrandContext(user);
  if (!ctx) {
    if (user.isSuperAdmin) redirect('/cabina-7k29x');
    // Un validator puro solo accede al escáner.
    if (user.brandMemberships.some((m) => m.role === 'validator')) redirect('/scan');
    redirect('/login?error=' + encodeURIComponent('No tienes acceso de promotor.'));
  }

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('slug, name')
    .eq('id', ctx.brandId)
    .maybeSingle();

  return (
    <div className={`admin-shell ${bricolage.variable} ${hanken.variable}`}>
      {ctx.impersonating && <ImpersonationBanner brandName={brand?.name ?? 'la marca'} />}
      <AdminTopbar brandName={brand?.name ?? 'Tu marca'} email={user.email} />
      <main className="s-wrap">{children}</main>
    </div>
  );
}
