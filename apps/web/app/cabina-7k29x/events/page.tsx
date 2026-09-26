import Link from 'next/link';
import { Plus, ChevronRight, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { idsMarcasDePrueba } from '@/lib/marcasDePrueba';
import { EventoCard } from '../visual';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// EVENTOS de todas las marcas (rediseño 2026-09-26). Agrupados por lo que
// importa: primero lo que se está vendiendo (con cuántas entradas lleva),
// después los borradores que todavía pueden salir, y plegado lo que ya pasó,
// lo archivado y lo DE PRUEBA — antes las corridas del E2E (decenas de
// borradores de Demo Test) tapaban al único evento real.
// ?brand=<slug> filtra a una marca (lo usa la ficha de la marca); con el
// filtro no se esconde nada, ni las de prueba.
// =============================================================

type Ev = { id: string; name: string; cover_url: string | null; starts_at: string; ends_at: string | null; is_published: boolean; archived_at: string | null; brand_id: string; brand: { slug: string; name: string } | { slug: string; name: string }[] | null };

const cuando = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Lima' });

export default async function EventsListPage({ searchParams }: { searchParams?: { brand?: string | string[] } }) {
  const supabase = createClient();
  const admin = createAdminClient();
  const brandRaw = Array.isArray(searchParams?.brand) ? searchParams?.brand[0] : searchParams?.brand;
  const brandSlug = (brandRaw ?? '').trim().replace(/[^a-z0-9-]/gi, '').slice(0, 42);

  let query = supabase
    .from('events')
    .select('id, name, cover_url, starts_at, ends_at, is_published, archived_at, brand_id, brand:brands!inner(slug, name)')
    .order('starts_at', { ascending: true });
  if (brandSlug) query = query.eq('brand.slug', brandSlug);
  const [{ data, error }, prueba] = await Promise.all([query, idsMarcasDePrueba(admin)]);
  // Un error no debe verse como "sin eventos": que salte al error boundary.
  if (error) throw new Error(`No se pudieron cargar los eventos: ${error.message}`);

  const esPrueba = new Set(prueba);
  const todos = (data ?? []) as Ev[];
  const marca = (e: Ev) => (Array.isArray(e.brand) ? e.brand[0] : e.brand);
  const ahora = Date.now();
  const termino = (e: Ev) => (e.ends_at ? Date.parse(e.ends_at) : Date.parse(e.starts_at) + 12 * 3600 * 1000) < ahora;

  const reales = brandSlug ? todos : todos.filter((e) => !esPrueba.has(e.brand_id));
  const dePrueba = brandSlug ? [] : todos.filter((e) => esPrueba.has(e.brand_id));
  const aLaVenta = reales.filter((e) => e.is_published && !e.archived_at && !termino(e));
  const borradores = reales.filter((e) => !e.is_published && !e.archived_at && !termino(e));
  // Lo que ya pasó, del más reciente al más viejo.
  const terminados = reales.filter((e) => !e.archived_at && termino(e)).reverse();
  const archivados = reales.filter((e) => e.archived_at).reverse();

  // Entradas emitidas (no anuladas) de lo que está a la venta: un conteo por evento.
  const entradas = await Promise.all(
    aLaVenta.map((e) => admin.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', e.id).is('invalidated_at', null).then((r) => (r.error ? null : r.count ?? 0))),
  );

  const nombreFiltro = brandSlug ? (todos[0] ? marca(todos[0])?.name : null) ?? brandSlug : null;

  const fila = (e: Ev, extra?: React.ReactNode) => (
    <li key={e.id} className="s-event-row">
      <Link href={`/cabina-7k29x/events/${e.id}`} className="s-event-row__main">
        <span className="s-event-row__name">{e.name}</span>
        <span className="s-event-row__date">{marca(e)?.name ?? '—'} · {cuando(e.starts_at)}</span>
      </Link>
      {extra}
      <ChevronRight className="s-event-row__chev" aria-hidden="true" />
    </li>
  );

  const plegado = (titulo: string, lista: Ev[], hint: string) =>
    lista.length > 0 && (
      <details className="s-fold">
        <summary>
          <span className="s-fold__t">
            {titulo} · {lista.length}
            <span className="s-fold__hint">{hint}</span>
          </span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div className="s-fold__body">
          <ul className="s-event-list">{lista.map((e) => fila(e))}</ul>
        </div>
      </details>
    );

  return (
    <>
      <div className="s-pagehead">
        <div>
          <h1 className="s-h1">Eventos</h1>
          <p className="s-card__desc">
            {aLaVenta.length} a la venta · {borradores.length} sin publicar
            {nombreFiltro && <> · de {nombreFiltro} · <Link href="/cabina-7k29x/events" className="s-textlink">ver todas las marcas</Link></>}
          </p>
        </div>
        {/* Cada organizador crea sus eventos desde su panel: acá es la excepción. */}
        <Link href="/cabina-7k29x/events/new" className="s-btn s-btn--soft">
          <Plus className="h-4 w-4" /> Nuevo evento
        </Link>
      </div>

      <section className="s-section" aria-labelledby="ev-venta">
        <h2 className="s-h2 s-h2--sec" id="ev-venta">A la venta</h2>
        {aLaVenta.length === 0 ? (
          <p className="s-calm">Ningún evento se está vendiendo en este momento.</p>
        ) : (
          // Tarjetas con el flyer, como en el panel del organizador; las
          // entradas van en una pastilla sobre la imagen.
          <ul className="c-evgrid">
            {aLaVenta.map((e, i) => (
              <EventoCard key={e.id} href={`/cabina-7k29x/events/${e.id}`} nombre={e.name} cover={e.cover_url}
                lineas={[marca(e)?.name ?? '—', cuando(e.starts_at)]}
                cifra={{ n: entradas[i] ?? null, label: entradas[i] === 1 ? 'entrada' : 'entradas' }} />
            ))}
          </ul>
        )}
      </section>

      {borradores.length > 0 && (
        <section className="s-section" aria-labelledby="ev-borr">
          <h2 className="s-h2 s-h2--sec" id="ev-borr">Sin publicar</h2>
          <ul className="c-evgrid">
            {borradores.map((e) => (
              <EventoCard key={e.id} href={`/cabina-7k29x/events/${e.id}`} nombre={e.name} cover={e.cover_url} lineas={[marca(e)?.name ?? '—', cuando(e.starts_at)]} />
            ))}
          </ul>
        </section>
      )}

      {(terminados.length > 0 || archivados.length > 0 || dePrueba.length > 0) && (
        <div className="s-folds">
          {plegado('Terminados', terminados, 'Ya pasaron. Sus entradas y estadísticas siguen disponibles.')}
          {plegado('Archivados', archivados, 'No se venden ni aparecen en público.')}
          {plegado('De prueba', dePrueba, 'De las marcas que usan las pruebas automáticas.')}
        </div>
      )}
    </>
  );
}
