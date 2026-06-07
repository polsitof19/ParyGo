import Link from 'next/link';
import { Plus, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function EventsListPage() {
  const supabase = createClient();
  const { data: events } = await supabase
    .from('events')
    .select('id, slug, name, starts_at, is_published, brand:brands(slug, name)')
    .order('starts_at', { ascending: false });

  return (
    <>
      <div className="s-pagehead">
        <div>
          <span className="eyebrow">Plataforma</span>
          <h1 className="s-h1" style={{ marginTop: 4 }}>Eventos</h1>
          <p className="s-card__desc">{events?.length ?? 0} evento{events?.length === 1 ? '' : 's'} en todas las marcas.</p>
        </div>
        <Link href="/super/events/new" className="s-btn s-btn--primary">
          <Plus className="h-4 w-4" /> Nuevo evento
        </Link>
      </div>

      {!events || events.length === 0 ? (
        <div className="s-card"><p className="s-empty">Sin eventos todavía. Creá una marca primero, después un evento.</p></div>
      ) : (
        <div className="s-card">
          <ul className="s-event-list" style={{ marginTop: 0 }}>
            {events.map((e) => {
              const brand = Array.isArray(e.brand) ? e.brand[0] : e.brand;
              return (
                <li key={e.id} className="s-event-row">
                  <Link href={`/super/events/${e.id}`} className="s-event-row__main">
                    <span className="s-event-row__name">{e.name}</span>
                    <span className="s-event-row__date">
                      {brand?.name ?? '—'} · {new Date(e.starts_at).toLocaleString('es-PE', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </Link>
                  <span className={`s-badge ${e.is_published ? 's-badge--ok' : 's-badge--draft'}`}>
                    {e.is_published ? 'Publicado' : 'Borrador'}
                  </span>
                  <Link href={`/super/events/${e.id}`} className="s-event-row__go" aria-label={`Abrir ${e.name}`}>
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
