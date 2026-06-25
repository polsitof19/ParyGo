import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createClient } from '@/lib/supabase/server';
import { EventBuilder } from './EventBuilder';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function NewBrandEventPage() {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) redirect('/login');
  // Crear evento es escritura: en solo lectura (super admin viendo la marca) no
  // se entra al form. El RPC es el guard real; esto es UX.
  if (ctx.impersonating) redirect('/admin');

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, event_balance')
    .eq('id', ctx.brandId)
    .single();
  if (!brand) redirect('/admin');

  // Hard gate (UX): sin saldo → no llega al form. El RPC es el guard real.
  if ((brand.event_balance ?? 0) <= 0) redirect('/admin');

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <Link href="/admin" className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> Tu panel
      </Link>
      <header style={{ marginBottom: 22 }}>
        <span className="eyebrow">Nuevo evento · {brand.name}</span>
        <h1 className="s-h1" style={{ marginTop: 8 }}>Crear evento</h1>
        <p className="s-card__desc">
          Consume 1 de tu saldo ({brand.event_balance} disponible{brand.event_balance === 1 ? '' : 's'}). El evento se crea en borrador; lo publicás cuando esté listo.
        </p>
      </header>
      <EventBuilder />
    </div>
  );
}
