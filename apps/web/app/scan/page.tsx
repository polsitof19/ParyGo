import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
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
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">[ VALIDADOR ]</p>
        <h1 className="font-display text-3xl uppercase leading-none tracking-tight">Escanear entradas</h1>
      </header>

      {!events || events.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Esta marca no tiene eventos para validar todavía.
          </CardContent>
        </Card>
      ) : (
        <Scanner events={events} brandName={brand.name} />
      )}
    </div>
  );
}
