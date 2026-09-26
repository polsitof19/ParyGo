import Link from 'next/link';
import { Plus, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { todas } from '@/lib/todas';
import { idsMarcasDePrueba } from '@/lib/marcasDePrueba';
import { ArchiveToggle } from '@/components/manage/ArchiveToggle';
import { setBrandArchivedAction } from './brands/[slug]/actions';
import { MarcaCard } from './visual';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// MARCAS = la pantalla PRINCIPAL de la cabina (Paul, 2026-09-26: "en el
// principal que aparezcan las marcas que hay, nada más"). Orden de pestañas:
// Marcas · Eventos · Ventas · Salud. Lo pendiente vive arriba de Salud.
// =============================================================
// Lo pendiente y los números del negocio viven en Inicio; acá está el
// inventario. Orden: activas reales (las que tienen algo que resolver arriba),
// y plegadas las archivadas y las DE PRUEBA, separadas: mezclar las corridas
// del E2E con las marcas reales era lo que hacía ilegible la lista.

// "hoy" / "ayer" / "hace 3 d" / "hace 2 meses". Corto: va en una celda.
function agoEs(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (!Number.isFinite(days)) return '—';
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months === 1 ? '' : 'es'}`;
  return `hace ${Math.floor(months / 12)} a`;
}

const quedan = (n: number) => (n === 0 ? 'Sin eventos en su pack' : `Le ${n === 1 ? 'queda 1 evento' : `quedan ${n} eventos`}`);

type BrandRow = {
  id: string;
  slug: string;
  name: string;
  event_balance: number;
  owner: string | null;
  eventsTotal: number;
  eventsSelling: number;
  archived: boolean;
  test: boolean;
  logoUrl: string | null;
  color: string | null;
  nextEvent: { name: string; starts_at: string } | null;
  lastSale: string | null;
};

export default async function MarcasPage() {
  const supabase = createClient();
  const admin = createAdminClient();
  const prueba = new Set(await idsMarcasDePrueba(admin));
  const [{ data: brands }, { data: members }, { data: events }, paidOrders, { count: solicitudes }] = await Promise.all([
    supabase.from('brands').select('id, slug, name, event_balance, archived_at, theme_json').order('created_at', { ascending: false }),
    supabase.from('brand_members').select('brand_id, display_name, role').eq('role', 'brand_admin'),
    supabase.from('events').select('brand_id, name, starts_at, ends_at, is_published, archived_at'),
    // Última venta por marca: ordenadas por paid_at DESC, la primera aparición
    // de cada marca es la última. Todas, paginadas (PostgREST corta en 1000).
    todas((a, b) => admin.from('orders').select('brand_id, paid_at').eq('status', 'paid').not('paid_at', 'is', null)
      .order('paid_at', { ascending: false }).order('id').range(a, b)),
    // Solicitudes de acceso viejas (el alta es autoservicio desde 2026-09-25):
    // solo para el link al pie, si hay historial.
    admin.from('access_requests').select('id', { count: 'exact', head: true }),
  ]);

  const ownerByBrand = new Map<string, string>();
  for (const m of members ?? []) if (!ownerByBrand.has(m.brand_id)) ownerByBrand.set(m.brand_id, m.display_name ?? '');

  const now = Date.now();
  const evByBrand = new Map<string, { total: number; selling: number }>();
  const nextByBrand = new Map<string, { name: string; starts_at: string }>();
  for (const e of events ?? []) {
    const cur = evByBrand.get(e.brand_id) ?? { total: 0, selling: 0 };
    cur.total += 1;
    // "Vendiendo" = publicado, no archivado y que todavía no terminó (un
    // evento pasado ya no vende aunque siga publicado).
    const termina = Date.parse(e.ends_at ?? e.starts_at) + (e.ends_at ? 0 : 12 * 3600 * 1000);
    if (e.is_published && !e.archived_at && termina > now) cur.selling += 1;
    evByBrand.set(e.brand_id, cur);
    if (e.is_published && !e.archived_at && Date.parse(e.starts_at) > now - 12 * 3600 * 1000) {
      const prev = nextByBrand.get(e.brand_id);
      if (!prev || Date.parse(e.starts_at) < Date.parse(prev.starts_at)) nextByBrand.set(e.brand_id, { name: e.name, starts_at: e.starts_at });
    }
  }

  const lastSaleByBrand = new Map<string, string>();
  for (const o of (paidOrders ?? []) as { brand_id: string; paid_at: string | null }[]) {
    if (o.paid_at && !lastSaleByBrand.has(o.brand_id)) lastSaleByBrand.set(o.brand_id, o.paid_at);
  }

  const allRows: BrandRow[] = (brands ?? []).map((b) => {
    const tj = (b.theme_json ?? {}) as { logo_url?: string | null; primary_color?: string };
    return {
      id: b.id,
      slug: b.slug,
      name: b.name,
      event_balance: b.event_balance ?? 0,
      owner: ownerByBrand.get(b.id) || null,
      eventsTotal: evByBrand.get(b.id)?.total ?? 0,
      eventsSelling: evByBrand.get(b.id)?.selling ?? 0,
      archived: !!b.archived_at,
      test: prueba.has(b.id),
      logoUrl: tj.logo_url ?? null,
      color: tj.primary_color ?? null,
      nextEvent: nextByBrand.get(b.id) ?? null,
      lastSale: lastSaleByBrand.get(b.id) ?? null,
    };
  });

  const isAlert = (r: BrandRow) => !r.owner || r.event_balance === 0;
  // Activas reales, las que tienen algo que resolver ARRIBA (orden estable).
  const rows = allRows
    .filter((r) => !r.archived && !r.test)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(isAlert(b.r)) - Number(isAlert(a.r)) || a.i - b.i)
    .map(({ r }) => r);
  const archivedRows = allRows.filter((r) => r.archived && !r.test);
  const testRows = allRows.filter((r) => r.test);
  const selling = rows.filter((r) => r.eventsSelling > 0).length;

  return (
    <>
      <div className="s-pagehead">
        <div>
          <h1 className="s-h1">Marcas</h1>
          <p className="s-card__desc">
            {rows.length} activa{rows.length === 1 ? '' : 's'} · {selling} vendiendo ahora
            {archivedRows.length > 0 && <> · {archivedRows.length} archivada{archivedRows.length === 1 ? '' : 's'}</>}
          </p>
        </div>
        {/* El alta es autoservicio (/empezar): crear a mano es la excepción, no
            el primario de la pantalla. */}
        <Link href="/cabina-7k29x/brands/new" className="s-btn s-btn--soft">
          <Plus className="h-4 w-4" /> Crear marca
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="s-calm">Todavía no hay marcas activas. Cuando alguien se registre en parygo.com, aparece acá.</p>
      ) : (
        // Tarjetas con el logo, como los eventos del panel del organizador
        // (Paul, 2026-09-26: "no me gusta que sea todo letras"). La tarjeta
        // entera abre la ficha, donde están cargar eventos, ver sus eventos y
        // entrar como la marca, cada uno con su nombre.
        <ul className="c-brandgrid">
          {rows.map((r) => (
            <MarcaCard
              key={r.id}
              href={`/cabina-7k29x/brands/${r.slug}`}
              nombre={r.name}
              logo={r.logoUrl}
              color={r.color}
              estado={r.eventsSelling > 0 ? 'vendiendo' : 'quieta'}
              detalle={[quedan(r.event_balance), r.lastSale ? `vendió ${agoEs(r.lastSale)}` : 'sin ventas'].join(' · ')}
              alerta={!r.owner ? 'Sin dueño' : null}
            />
          ))}
        </ul>
      )}

      {/* LO RARO, PLEGADO. */}
      {(archivedRows.length > 0 || testRows.length > 0) && (
        <div className="s-folds">
          {archivedRows.length > 0 && (
            <details className="s-fold">
              <summary>
                <span className="s-fold__t">
                  Archivadas · {archivedRows.length}
                  <span className="s-fold__hint">No aparecen en público y sus eventos no se venden. Puedes desarchivarlas.</span>
                </span>
                <ChevronDown aria-hidden="true" />
              </summary>
              <div className="s-fold__body">
                <ul className="s-event-list">
                  {archivedRows.map((r) => (
                    <li key={r.id} className="s-event-row">
                      <Link href={`/cabina-7k29x/brands/${r.slug}`} className="s-event-row__main">
                        <span className="s-event-row__name">{r.name}</span>
                        <span className="s-event-row__date">{r.slug}.parygo.com · {r.eventsTotal} evento{r.eventsTotal === 1 ? '' : 's'}</span>
                      </Link>
                      <ArchiveToggle id={r.id} archived={true} action={setBrandArchivedAction} noun="la marca" />
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}
          {testRows.length > 0 && (
            <details className="s-fold">
              <summary>
                <span className="s-fold__t">
                  De prueba · {testRows.length}
                  <span className="s-fold__hint">Las usan las pruebas automáticas. No suman en ningún número de la cabina.</span>
                </span>
                <ChevronDown aria-hidden="true" />
              </summary>
              <div className="s-fold__body">
                <ul className="s-event-list">
                  {testRows.map((r) => (
                    <li key={r.id} className="s-event-row">
                      <Link href={`/cabina-7k29x/brands/${r.slug}`} className="s-event-row__main">
                        <span className="s-event-row__name">{r.name}</span>
                        <span className="s-event-row__date">{r.slug}.parygo.com · {r.archived ? 'archivada' : 'activa'}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}
        </div>
      )}

      {(solicitudes ?? 0) > 0 && (
        <p className="s-foot-link">
          <Link href="/cabina-7k29x/solicitudes" className="s-textlink">Solicitudes de acceso antiguas ({solicitudes})</Link>
        </p>
      )}
    </>
  );
}
