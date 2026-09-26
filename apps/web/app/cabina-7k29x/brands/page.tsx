import Link from 'next/link';
import { Plus, Wallet, CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { todas } from '@/lib/todas';
import { idsMarcasDePrueba } from '@/lib/marcasDePrueba';
import { BrandLogo } from '@/components/BrandLogo';
import { ArchiveToggle } from '@/components/manage/ArchiveToggle';
import { setBrandArchivedAction } from './[slug]/actions';
import { EnterBrandButton } from './[slug]/EnterBrandButton';
import { onColor, bgFor, initialOf } from '../on-color';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// MARCAS (pestaña propia desde 2026-09-26; antes era la home de la cabina)
// =============================================================
// Lo pendiente y los números del negocio viven en Inicio; acá está el
// inventario. Orden: activas reales (las que tienen algo que resolver arriba),
// y plegadas las archivadas y las DE PRUEBA, separadas: mezclar las corridas
// del E2E con las marcas reales era lo que hacía ilegible la lista.

function BrandAvatar({ name, slug, logoUrl, color }: { name: string; slug: string; logoUrl: string | null; color: string | null }) {
  if (logoUrl) return <BrandLogo src={logoUrl} alt="" size={40} ring={false} />;
  return (
    <span className="s-avatar" style={{ background: color || bgFor(slug), color: onColor(color || bgFor(slug)) }}>
      {initialOf(name)}
    </span>
  );
}

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

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'America/Lima' });

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

  const estado = (r: BrandRow) =>
    r.eventsSelling > 0
      ? <span className="s-badge s-badge--ok">Vendiendo</span>
      : <span className="s-badge s-badge--draft">Sin evento a la venta</span>;

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
        <>
          {/* Compu: tabla densa, con las acciones rápidas (con puntero, el
              title explica cada ícono). */}
          <div className="s-table-wrap s-table-wrap--brands">
            <div className="s-card s-card--flush">
              <table className="s-table">
                <thead>
                  <tr>
                    <th>Marca</th>
                    <th className="num">Eventos en su pack</th>
                    <th>Próximo evento</th>
                    <th>Última venta</th>
                    <th>Dueño</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/cabina-7k29x/brands/${r.slug}`} className="s-cell-brand s-rowlink" aria-label={`Abrir ${r.name}`}>
                          <BrandAvatar name={r.name} slug={r.slug} logoUrl={r.logoUrl} color={r.color} />
                          <span>
                            <span className="nm" style={{ display: 'block' }}>{r.name}</span>
                            <span className="sl">{r.slug}.parygo.com · {r.eventsTotal} evento{r.eventsTotal === 1 ? '' : 's'} creados</span>
                          </span>
                        </Link>
                      </td>
                      <td className="num">
                        {r.event_balance === 0 ? <span className="s-flag">0</span> : <span className="s-saldo-num">{r.event_balance}</span>}
                      </td>
                      <td>
                        {r.nextEvent
                          ? <span className="s-cellmeta"><span className="nm">{r.nextEvent.name}</span>{shortDate(r.nextEvent.starts_at)}</span>
                          : <span className="s-cellmeta s-cellmeta--none">—</span>}
                      </td>
                      <td>
                        {r.lastSale ? <span className="s-cellmeta">{agoEs(r.lastSale)}</span> : <span className="s-cellmeta s-cellmeta--none">Sin ventas</span>}
                      </td>
                      <td>
                        {r.owner ? <span className="s-muted s-cell-ellipsis" title={r.owner}>{r.owner}</span> : <span className="s-flag">Sin dueño</span>}
                      </td>
                      <td>{estado(r)}</td>
                      <td>
                        <span className="s-rowacts">
                          <Link href={`/cabina-7k29x/brands/${r.slug}#saldo`} className="s-rowbtn" title="Cargar eventos a su pack" aria-label={`Cargar eventos a ${r.name}`}>
                            <Wallet />
                          </Link>
                          <Link href={`/cabina-7k29x/events?brand=${r.slug}`} className="s-rowbtn" title="Ver sus eventos" aria-label={`Ver eventos de ${r.name}`}>
                            <CalendarDays />
                          </Link>
                          <EnterBrandButton brandId={r.id} brandName={r.name} variant="icon" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Teléfono: una fila por marca que abre su ficha. Sin íconos sueltos:
              en el iPhone el title no existe y tres dibujos mudos no se
              distinguen; cargar eventos, ver sus eventos y entrar como la marca
              están con su nombre dentro de la ficha. */}
          <div className="s-brandcards">
            {rows.map((r) => (
              <Link key={r.id} href={`/cabina-7k29x/brands/${r.slug}`} className="s-brandcard s-brandcard--link" aria-label={`Abrir ${r.name}`}>
                <span className="s-brandcard__main">
                  <BrandAvatar name={r.name} slug={r.slug} logoUrl={r.logoUrl} color={r.color} />
                  <span style={{ minWidth: 0 }}>
                    <span className="nm" style={{ display: 'block' }}>{r.name}</span>
                    <span className="meta">{r.slug}.parygo.com</span>
                    <span className="meta">
                      {quedan(r.event_balance)}
                      {' · '}
                      {r.nextEvent ? `próximo: ${r.nextEvent.name}, ${shortDate(r.nextEvent.starts_at)}` : 'sin próximo evento'}
                      {' · '}
                      {r.lastSale ? `vendió ${agoEs(r.lastSale)}` : 'sin ventas'}
                    </span>
                    {!r.owner && <span className="s-cardflags"><span className="s-flag">Sin dueño</span></span>}
                    <span className="s-brandcard__estado">{estado(r)}</span>
                  </span>
                </span>
                <ChevronRight className="s-brandcard__chev" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </>
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
