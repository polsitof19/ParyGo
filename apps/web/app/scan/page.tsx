import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Scanner } from './Scanner';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function ScanPage() {
  const user = await requireSession();
  const membership = user.brandMemberships.find(
    (m) => m.role === 'validator' || m.role === 'brand_admin'
  );
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
    .order('starts_at', { ascending: false });

  return (
    <div className="k-stack">
      <div>
        <span className="k-eyebrow">Validador</span>
        <h1 className="k-h1" style={{ marginTop: 2 }}>Escanear entradas</h1>
      </div>

      {!events || events.length === 0 ? (
        <div className="k-empty">No hay eventos cargados para validar. Pedile al promotor que publique el evento.</div>
      ) : (
        <Scanner events={events} brandName={brand.name} />
      )}
    </div>
  );
}
