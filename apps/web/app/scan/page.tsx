import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { textosPanel } from '@/lib/idiomaServer';
import { Scanner } from './Scanner';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function ScanPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/scan');
  // Misma elección que el layout: el organizador primero.
  const membership =
    user.brandMemberships.find((m) => m.role === 'brand_admin') ??
    user.brandMemberships.find((m) => m.role === 'validator');
  if (!membership) redirect(user.isSuperAdmin ? '/cabina-7k29x' : '/login');

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, name')
    .eq('id', membership.brandId)
    .single();
  if (!brand) redirect('/login');

  const { t } = await textosPanel();

  const { data: events } = await supabase
    .from('events')
    .select('id, name, starts_at')
    .eq('brand_id', brand.id)
    // Solo eventos vigentes para la puerta: publicados y no archivados. Un
    // borrador o un evento archivado no tiene gente para validar.
    .eq('is_published', true)
    .is('archived_at', null)
    .order('starts_at', { ascending: false });

  return (
    <div className="k-stack">
      {/* Sin eyebrow "Validador" (2026-10-01): el organizador también entra
          acá, y un rótulo en mayúsculas encima del título no informa nada. */}
      <h1 className="k-h1">{t('Escanear entradas', 'Scan tickets')}</h1>

      {!events || events.length === 0 ? (
        membership.role === 'brand_admin' ? (
          <div className="k-empty">
            <p style={{ margin: '0 0 16px' }}>{t('Publica un evento para escanear sus entradas.', 'Publish an event to scan its tickets.')}</p>
            <Link href="/admin" className="k-btn k-btn--soft">{t('Ir a mis eventos', 'Go to my events')}</Link>
          </div>
        ) : (
          <div className="k-empty">{t('No hay eventos cargados para validar. Pídele al organizador que publique el evento.', 'No events loaded to validate. Ask the organizer to publish the event.')}</div>
        )
      ) : (
        <Scanner events={events} brandName={brand.name} />
      )}
    </div>
  );
}
