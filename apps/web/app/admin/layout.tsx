import { GeistSans } from 'geist/font/sans';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createClient } from '@/lib/supabase/server';
import { AdminTopbar } from './AdminTopbar';
import { ImpersonationBanner } from './ImpersonationBanner';
// Orden: tokens → base compartida de paneles → lo propio del organizador.
import '../styles/parygo-tokens.css';
import '../styles/parygo-panel.css';
import './admin.css';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Tema NOCHE (2026-09-23), el mismo del comprador: fondo #0A0A0A y Geist en
// todo. Los tokens son los de .pg.pg-noche (medidos por test:contrast); lo
// propio del panel vive en parygo-panel.css.


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
    .select('slug, name, theme_json')
    .eq('id', ctx.brandId)
    .maybeSingle();

  const logoUrl = (brand?.theme_json as { logo_url?: string | null } | null)?.logo_url ?? null;

  return (
    <div className={`pg pg-noche pg-panel admin-shell ${GeistSans.variable}`}>
      {ctx.impersonating && <ImpersonationBanner brandName={brand?.name ?? "la marca"} modoEdicion={ctx.modoEdicion} />}
      <AdminTopbar brandName={brand?.name ?? 'Tu marca'} email={user.email} logoUrl={logoUrl} soloLectura={ctx.impersonating} />
      <main className="s-wrap">{children}</main>
    </div>
  );
}
