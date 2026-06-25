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
    redirect('/cabina-7k29x/brands/new');
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Link href="/cabina-7k29x/events" className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> Eventos
      </Link>
      <header style={{ marginBottom: 22 }}>
        <span className="eyebrow">Nuevo evento</span>
        <h1 className="s-h1" style={{ marginTop: 8 }}>Crear evento</h1>
        <p className="s-card__desc">
          Solo super admin crea eventos. El dueño después edita contenido y tipos de entrada.
        </p>
      </header>
      <NewEventForm brands={brands} preselectedSlug={searchParams.brand ?? null} />
    </div>
  );
}
