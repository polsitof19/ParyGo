import { redirect } from 'next/navigation';
import { ScanLine } from 'lucide-react';

import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ScanServiceWorker } from './ScanServiceWorker';
import { ScanLogoutButton } from './ScanLogoutButton';
import { IdiomaProvider } from '@/components/IdiomaPanel';
import { textos } from '@/lib/idioma';
import './scan.css';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';


export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  // Sin sesión (o vencida): al login, y DE VUELTA al escáner después. Antes
  // requireSession mandaba a /login sin decir de dónde venía y el organizador
  // terminaba en su panel: "abrí el escáner y la página se reinició".
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/scan');
  // El organizador tiene prioridad sobre un rol de validador en otra marca:
  // abre el escáner de SU marca y ve el atajo de vuelta al panel.
  const membership =
    user.brandMemberships.find((m) => m.role === 'brand_admin') ??
    user.brandMemberships.find((m) => m.role === 'validator');
  if (!membership) {
    redirect(user.isSuperAdmin ? '/cabina-7k29x' : '/login?error=' + encodeURIComponent('Acceso solo para staff de puerta.'));
  }

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('name')
    .eq('id', membership.brandId)
    .maybeSingle();

  // Idioma = el de la marca cuyo escáner se abre (0073).
  const { t } = textos(membership.idioma);

  return (
    <IdiomaProvider lang={membership.idioma}>
    <div lang={membership.idioma} className={`scan-shell`}>
      <ScanServiceWorker />
      <header className="k-header">
        <div className="k-header__in">
          <span className="k-brand">
            <ScanLine className="h-5 w-5" />
            {brand?.name ?? t('Puerta', 'Door')}
            <span className="k-tag">{t('Puerta', 'Door')}</span>
          </span>
          <span className="k-header__right">
            {membership.role === 'brand_admin' && (
              <Link href="/admin" className="k-panel" aria-label={t('Volver a tu panel', 'Back to your dashboard')}>
                <LayoutGrid className="h-4 w-4" aria-hidden="true" /> {t('Panel', 'Dashboard')}
              </Link>
            )}
            <ScanLogoutButton />
          </span>
        </div>
      </header>
      <main className="k-wrap">{children}</main>
    </div>
    </IdiomaProvider>
  );
}
