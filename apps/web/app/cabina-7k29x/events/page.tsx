import Link from 'next/link';
import { Plus, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function EventsListPage({ searchParams }: { searchParams?: { brand?: string | string[] } }) {
  const supabase = createClient();
  // ?brand=<slug> filtra la lista a una marca. Solo lectura y saneado a los
  // caracteres de un slug; alimenta la acción rápida "ver eventos" de la tabla
  // de marcas. Sin el filtro, la lista sigue siendo la de siempre.
  const brandRaw = Array.isArray(searchParams?.brand) ? searchParams?.brand[0] : searchParams?.brand;
  const brandSlug = (brandRaw ?? '').trim().replace(/[^a-z0-9-]/gi, '').slice(0, 42);

  let query = supabase
    .from('events')
    .select('id, slug, name, starts_at, is_published, brand:brands!inner(slug, name)')
    .order('starts_at', { ascending: false });
  // Filtro sobre el recurso embebido por su ALIAS (brand), la forma canónica.
  if (brandSlug) query = query.eq('brand.slug', brandSlug);
  const { data: events, error } = await query;
  // Un error no debe verse como "sin eventos": que salte al error boundary.
  if (error) throw new Error(`No se pudieron cargar los eventos: ${error.message}`);

  const filteredName = brandSlug
    ? (() => { const b = events?.[0]?.brand; const r = Array.isArray(b) ? b[0] : b; return r?.name ?? brandSlug; })()
    : null;

  return (
    <>
      <div className="s-pagehead">
        <div>
          <h1 className="s-h1" style={{ marginTop: 8 }}>Eventos</h1>
          <p className="s-card__desc">
            {events?.length ?? 0} evento{events?.length === 1 ? '' : 's'}
            {filteredName ? <> de {filteredName} · <Link href="/cabina-7k29x/events" className="s-textlink">ver todas las marcas</Link></> : ' en todas las marcas.'}
          </p>
        </div>
        <Link href="/cabina-7k29x/events/new" className="s-btn s-btn--primary">
          <Plus className="h-4 w-4" /> Nuevo evento
        </Link>
      </div>

      {!events || events.length === 0 ? (
        <div className="s-card"><p className="s-empty">Sin eventos todavía. Crea una marca primero, después un evento.</p></div>
      ) : (
        <div className="s-card">
          <ul className="s-event-list" style={{ marginTop: 0 }}>
            {events.map((e) => {
              const brand = Array.isArray(e.brand) ? e.brand[0] : e.brand;
              return (
                <li key={e.id} className="s-event-row">
                  <Link href={`/cabina-7k29x/events/${e.id}`} className="s-event-row__main">
                    <span className="s-event-row__name">{e.name}</span>
                    <span className="s-event-row__date">
                      {brand?.name ?? '—'} · {new Date(e.starts_at).toLocaleString('es-PE', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
                      })}
                    </span>
                  </Link>
                  <span className={`s-badge ${e.is_published ? 's-badge--ok' : 's-badge--draft'}`}>
                    {e.is_published ? 'Publicado' : 'Borrador'}
                  </span>
                  <Link href={`/cabina-7k29x/events/${e.id}`} className="s-event-row__go" aria-label={`Abrir ${e.name}`}>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
