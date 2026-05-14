import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { NewEventForm } from './NewEventForm';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nuevo evento' };

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: { brand?: string };
}) {
  const supabase = createClient();
  const { data: brands } = await supabase
    .from('brands')
    .select('id, slug, name')
    .order('name');

  if (!brands || brands.length === 0) {
    redirect('/super/brands/new');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href="/super/events"
        className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Volver a eventos
      </Link>
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ NUEVO EVENTO ]
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight">
          Crear evento
        </h1>
        <p className="text-muted-foreground">
          Solo super admin puede crear eventos. El brand admin después edita
          contenido y tipos de entrada.
        </p>
      </header>
      <NewEventForm brands={brands} preselectedSlug={searchParams.brand ?? null} />
    </div>
  );
}
