import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
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
      <div>
        <span className="k-eyebrow">Validador</span>
        <h1 className="k-h1" style={{ marginTop: 2 }}>Escanear entradas</h1>
      </div>

      {!events || events.length === 0 ? (
        <div className="k-empty">No hay eventos cargados para validar. Pídele al organizador que publique el evento.</div>
      ) : (
        <Scanner events={events} brandName={brand.name} />
      )}
    </div>
  );
}
