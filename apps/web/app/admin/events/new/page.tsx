import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { EventBuilder } from './EventBuilder';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function NewBrandEventPage() {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) redirect('/login');

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, event_balance')
    .eq('id', membership.brandId)
    .single();
  if (!brand) redirect('/admin');

  // Hard gate (UX): no balance → can't reach the form. The RPC is the real
  // server-side guard, but we also keep the form unreachable at 0.
  if ((brand.event_balance ?? 0) <= 0) redirect('/admin');

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Volver
      </Link>
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ NUEVO EVENTO · {brand.name} ]
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight">Crear evento</h1>
        <p className="text-sm text-muted-foreground">
          Consume 1 de tu saldo ({brand.event_balance} disponible
          {brand.event_balance === 1 ? '' : 's'}). El evento se crea en borrador; lo publicás cuando esté listo.
        </p>
      </header>
      <EventBuilder />
    </div>
  );
}
