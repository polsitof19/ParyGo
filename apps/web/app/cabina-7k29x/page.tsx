import Link from 'next/link';
import { Plus, Wallet, CalendarDays, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { todas } from '@/lib/todas';
import { idsMarcasDePrueba, sinMarcasDePrueba, soloConComprobante } from '@/lib/marcasDePrueba';
import { BrandLogo } from '@/components/BrandLogo';
import { ArchiveToggle } from '@/components/manage/ArchiveToggle';
import { setBrandArchivedAction } from './brands/[slug]/actions';
import { EnterBrandButton } from './brands/[slug]/EnterBrandButton';
import { onColor, bgFor, initialOf } from './on-color';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Avatar de marca: logo real si está subido; si no, color de marca (o hash) + inicial.
function BrandAvatar({ name, slug, logoUrl, color }: { name: string; slug: string; logoUrl: string | null; color: string | null }) {
  if (logoUrl) return <BrandLogo src={logoUrl} alt="" size={40} ring={false} />;
  return (
    <span className="s-avatar" style={{ background: color || bgFor(slug), color: onColor(color || bgFor(slug)) }}>
      {initialOf(name)}
    </span>
  );
}

// "hace 3 d" / "hace 2 mes". Corto a propósito: va en una celda de tabla.
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
  new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', timeZone: 'America/Lima' });

type BrandRow = {
  id: string;
  slug: string;
  name: string;
  event_balance: number;
  owner: string | null;
  eventsTotal: number;
  eventsPublished: number;
  archived: boolean;
  logoUrl: string | null;
  color: string | null;
  nextEvent: { name: string; starts_at: string } | null;
  lastSale: string | null;
};

export default async function SuperHome() {
  const supabase = createClient();

  const admin = createAdminClient();
  const HEAD = { count: 'exact' as const, head: true };
  // Marcas de prueba (0057): no suman a los KPIs, pero SÍ siguen en la lista —
  // Paul las administra desde acá. Se marcan con un badge para que el número
  // y la lista no parezcan contradecirse.
  const prueba = await idsMarcasDePrueba(admin);
  const esPrueba = new Set(prueba);
  const [{ data: brands }, { data: members }, { data: events }, { data: paidOrders }, { count: yapePending }, { count: pendingRequests }] = await Promise.all([
    supabase.from('brands').select('id, slug, name, event_balance, archived_at, theme_json').order('created_at', { ascending: false }),
    supabase.from('brand_members').select('brand_id, display_name, role').eq('role', 'brand_admin'),
    // starts_at y name vienen en la MISMA consulta que ya existía: el "próximo
    // evento" de cada marca no cuesta un viaje extra.
    supabase.from('events').select('brand_id, name, starts_at, is_published, archived_at'),
    // Última venta por marca: ordenadas por paid_at DESC, la primera aparición
    // de cada marca es su última venta. Todas, paginadas (PostgREST corta en 1000).
    todas((a, b) => admin.from('orders').select('brand_id, paid_at').eq('status', 'paid').not('paid_at', 'is', null)
      .order('paid_at', { ascending: false }).order('id').range(a, b)).then((data) => ({ data })),
    // Yape por revisar + solicitudes pendientes — agregados cross-tenant (admin client), igual que /salud y /solicitudes.
    soloConComprobante(sinMarcasDePrueba(admin.from('orders').select('id', HEAD).eq('status', 'pending_yape_review'), prueba)),
    admin.from('access_requests').select('id', HEAD).eq('status', 'pending'),
  ]);

  const ownerByBrand = new Map<string, string>();
  for (const m of members ?? []) if (!ownerByBrand.has(m.brand_id)) ownerByBrand.set(m.brand_id, m.display_name ?? '');

  const evByBrand = new Map<string, { total: number; pub: number }>();
  const nextByBrand = new Map<string, { name: string; starts_at: string }>();
  const now = Date.now();
  for (const e of events ?? []) {
    const cur = evByBrand.get(e.brand_id) ?? { total: 0, pub: 0 };
    cur.total += 1;
    // "Vendiendo" = publicado y NO archivado (alineado con /salud).
    if (e.is_published && !e.archived_at) cur.pub += 1;
    evByBrand.set(e.brand_id, cur);
    // Próximo evento = el más cercano en el futuro, publicado y no archivado.
    if (e.is_published && !e.archived_at && Date.parse(e.starts_at) > now) {
      const prev = nextByBrand.get(e.brand_id);
      if (!prev || Date.parse(e.starts_at) < Date.parse(prev.starts_at)) {
        nextByBrand.set(e.brand_id, { name: e.name, starts_at: e.starts_at });
      }
    }
  }

  const lastSaleByBrand = new Map<string, string>();
  for (const o of paidOrders ?? []) {
    if (!o.paid_at) continue;
    const prev = lastSaleByBrand.get(o.brand_id);
    if (!prev || Date.parse(o.paid_at) > Date.parse(prev)) lastSaleByBrand.set(o.brand_id, o.paid_at);
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
      eventsPublished: evByBrand.get(b.id)?.pub ?? 0,
      archived: !!b.archived_at,
      logoUrl: tj.logo_url ?? null,
      color: tj.primary_color ?? null,
      nextEvent: nextByBrand.get(b.id) ?? null,
      lastSale: lastSaleByBrand.get(b.id) ?? null,
    };
  });

  // Las archivadas van en su propia sección al final; no se mezclan con las activas.
  const archivedRows = allRows.filter((r) => r.archived);
  const isAlert = (r: BrandRow) => !r.owner || r.event_balance === 0;
  // Orden: las marcas con algo que resolver ARRIBA. Al quitar la fila pintada,
  // el orden es lo que reemplaza al barrido visual de "cuáles están mal".
  // Dentro de cada grupo se conserva el orden original (más nuevas primero).
  const rows = allRows
    .filter((r) => !r.archived)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(isAlert(b.r)) - Number(isAlert(a.r)) || a.i - b.i)
    .map(({ r }) => r);


  // KPIs de plataforma (dashboard) — marcas activas, eventos vendiendo, Yape por revisar, solicitudes.
  const brandsActive = rows.filter((r) => !esPrueba.has(r.id)).length;
  // Las de prueba QUE ESTÁN EN LA LISTA. No sirve esPrueba.size: incluye las
  // archivadas (demotest), que se listan aparte y no entran en `rows`.
  const pruebaEnLista = rows.filter((r) => esPrueba.has(r.id)).length;
  const eventsSelling = rows.reduce((acc, r) => (esPrueba.has(r.id) ? acc : acc + r.eventsPublished), 0);
  const yapeReview = yapePending ?? 0;
  const pendingReqs = pendingRequests ?? 0;

  const quickActions = (r: BrandRow) => (
    <span className="s-rowacts">
      <Link href={`/cabina-7k29x/brands/${r.slug}#saldo`} className="s-rowbtn" title="Recargar saldo" aria-label={`Recargar saldo de ${r.name}`}>
        <Wallet />
      </Link>
      <Link href={`/cabina-7k29x/events?brand=${r.slug}`} className="s-rowbtn" title="Ver eventos" aria-label={`Ver eventos de ${r.name}`}>
        <CalendarDays />
      </Link>
      <EnterBrandButton brandId={r.id} brandName={r.name} variant="icon" />
    </span>
  );

  // ORDEN (2026-09-22): lo que espera a Paul arriba, el inventario en una
  // línea, la lista, y las archivadas plegadas. Las solicitudes de acceso son
  // la tarea más vieja (alguien espera respuesta) y se llevan la cifra héroe;
  // el resto de lo pendiente va en líneas debajo, cada una con su acción.
  const sinSaldo = rows.filter((r) => r.event_balance === 0);
  const sinDueno = rows.filter((r) => !r.owner);
  const due = pendingReqs > 0
    ? { n: pendingReqs, what: `solicitud${pendingReqs === 1 ? '' : 'es'}`, sub: 'de acceso esperando respuesta.', href: '/cabina-7k29x/solicitudes', cta: 'Ver solicitudes' }
    : yapeReview > 0
      ? { n: yapeReview, what: `Yape${yapeReview === 1 ? '' : 's'}`, sub: 'con comprobante subido, sin revisar por su marca.', href: '/cabina-7k29x/salud', cta: 'Ver en Salud' }
      : null;
  const nombres = (list: BrandRow[]) => list.slice(0, 3).map((r) => r.name).join(', ') + (list.length > 3 ? ` y ${list.length - 3} más` : '');

  return (
    <>
      <div className="s-pagehead">
        <div>
          <h1 className="s-h1">Marcas</h1>
          <p className="s-card__desc">
            {/* El inventario, en una línea: cuenta solo marcas reales (las de
                prueba no suman) y dice cuántas de prueba hay en la lista para
                que el número y la lista no parezcan contradecirse. */}
            {brandsActive} activa{brandsActive === 1 ? '' : 's'} · {eventsSelling} evento{eventsSelling === 1 ? '' : 's'} vendiendo
            {pruebaEnLista > 0 && <> · {pruebaEnLista} de prueba en la lista</>}
          </p>
        </div>
        <Link href="/cabina-7k29x/brands/new" className={`s-btn ${due ? 's-btn--soft' : 's-btn--primary'}`}>
          <Plus className="h-4 w-4" /> Crear marca
        </Link>
      </div>

      {/* 1) PENDIENTE */}
      {due && (
        <div className="s-due" role="status">
          <div className="s-due__txt">
            <span className="s-due__k">Por resolver</span>
            <span className="s-due__n">{due.n} {due.what}</span>
            <span className="s-due__sub">{due.sub}</span>
          </div>
          <Link href={due.href} className="s-btn s-btn--primary">{due.cta}</Link>
        </div>
      )}
      {(pendingReqs > 0 && yapeReview > 0) || sinSaldo.length > 0 || sinDueno.length > 0 ? (
        <div className="s-todos">
          {pendingReqs > 0 && yapeReview > 0 && (
            <div className="s-todo">
              <span className="s-todo__txt"><span><strong>{yapeReview} Yape{yapeReview === 1 ? '' : 's'} por revisar</strong><span className="s-todo__sub">Con comprobante subido, en marcas reales.</span></span></span>
              <Link href="/cabina-7k29x/salud" className="s-btn s-btn--soft s-btn--sm">Ver en Salud</Link>
            </div>
          )}
          {sinSaldo.length > 0 && (
            <div className="s-todo">
              <span className="s-todo__txt"><span><strong>{sinSaldo.length} marca{sinSaldo.length === 1 ? '' : 's'} sin saldo</strong><span className="s-todo__sub">{nombres(sinSaldo)}</span></span></span>
              <Link href={`/cabina-7k29x/brands/${sinSaldo[0]!.slug}#saldo`} className="s-btn s-btn--soft s-btn--sm">Recargar{sinSaldo.length > 1 ? ` ${sinSaldo[0]!.name}` : ''}</Link>
            </div>
          )}
          {sinDueno.length > 0 && (
            <div className="s-todo s-todo--alert">
              <span className="s-todo__txt"><span><strong>{sinDueno.length} marca{sinDueno.length === 1 ? '' : 's'} sin dueño</strong><span className="s-todo__sub">{nombres(sinDueno)} · nadie puede entrar a su panel.</span></span></span>
              <Link href={`/cabina-7k29x/brands/${sinDueno[0]!.slug}`} className="s-btn s-btn--soft s-btn--sm">Asignar</Link>
            </div>
          )}
        </div>
      ) : !due ? (
        <p className="s-calm">Nada por resolver: sin solicitudes, sin Yapes trabados, todas las marcas con saldo y dueño.</p>
      ) : null}

      {allRows.length === 0 ? (
        <div className="s-card"><p className="s-empty">Todavía no hay marcas. Crea la primera.</p></div>
      ) : rows.length === 0 ? (
        <div className="s-card"><p className="s-empty">Todas las marcas están archivadas. Mira la sección “Archivadas” más abajo.</p></div>
      ) : (
        <>
          {/* Desktop: tabla densa */}
          <div className="s-table-wrap s-table-wrap--brands">
            <div className="s-card s-card--flush">
              <table className="s-table">
                <thead>
                  <tr>
                    <th>Marca</th>
                    <th className="num">Saldo</th>
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
                            <span className="nm" style={{ display: 'block' }}>
                              {r.name}
                              {/* Badge de prueba: explica por qué la marca está
                                  en la lista pero no en los números de arriba. */}
                              {esPrueba.has(r.id) && (
                                <span className="s-badge s-badge--draft s-badge--inline">Prueba</span>
                              )}
                            </span>
                            <span className="sl">
                              {r.slug}.parygo.com · {r.eventsTotal} evento{r.eventsTotal === 1 ? '' : 's'}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="num">
                        {r.event_balance === 0
                          ? <span className="s-flag">0</span>
                          : <span className="s-saldo-num">{r.event_balance}</span>}
                      </td>
                      <td>
                        {r.nextEvent
                          ? <span className="s-cellmeta"><span className="nm">{r.nextEvent.name}</span>{shortDate(r.nextEvent.starts_at)}</span>
                          : <span className="s-cellmeta s-cellmeta--none">—</span>}
                      </td>
                      <td>
                        {r.lastSale
                          ? <span className="s-cellmeta">{agoEs(r.lastSale)}</span>
                          : <span className="s-cellmeta s-cellmeta--none">Sin ventas</span>}
                      </td>
                      <td>
                        {r.owner
                          ? <span className="s-muted s-cell-ellipsis" title={r.owner}>{r.owner}</span>
                          : <span className="s-flag">Sin dueño</span>}
                      </td>
                      <td>
                        {r.eventsPublished > 0
                          ? <span className="s-badge s-badge--ok">Vendiendo</span>
                          : <span className="s-badge s-badge--draft">Sin publicar</span>}
                      </td>
                      <td>{quickActions(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Móvil: cards */}
          <div className="s-brandcards">
            {rows.map((r) => (
              <div key={r.id} className="s-brandcard">
                <Link href={`/cabina-7k29x/brands/${r.slug}`} className="s-brandcard__main" aria-label={`Abrir ${r.name}`}>
                  <BrandAvatar name={r.name} slug={r.slug} logoUrl={r.logoUrl} color={r.color} />
                  <span style={{ minWidth: 0 }}>
                    <span className="nm" style={{ display: 'block' }}>
                      {r.name}
                      {esPrueba.has(r.id) && <span className="s-badge s-badge--draft s-badge--inline">Prueba</span>}
                    </span>
                    <span className="meta">
                      {r.slug}.parygo.com · Saldo {r.event_balance} · {r.eventsTotal} evento{r.eventsTotal === 1 ? '' : 's'}
                    </span>
                    <span className="meta">
                      {r.nextEvent ? `Próximo: ${r.nextEvent.name} · ${shortDate(r.nextEvent.starts_at)}` : 'Sin próximo evento'}
                      {' · '}
                      {r.lastSale ? `Última venta ${agoEs(r.lastSale)}` : 'Sin ventas'}
                    </span>
                    {isAlert(r) && (
                      <span className="s-cardflags">
                        {!r.owner && <span className="s-flag">Sin dueño</span>}
                        {r.event_balance === 0 && <span className="s-flag">Sin saldo</span>}
                      </span>
                    )}
                  </span>
                </Link>
                <span className="s-brandcard__side">
                  {r.eventsPublished > 0
                    ? <span className="s-badge s-badge--ok">Vendiendo</span>
                    : <span className="s-badge s-badge--draft">Sin publicar</span>}
                  {quickActions(r)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* LO RARO, PLEGADO — archivadas: solo lectura + desarchivar. */}
      {archivedRows.length > 0 && (
        <details className="s-fold s-folds">
          <summary>
            <span className="s-fold__t">
              Archivadas ({archivedRows.length})
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
                  <span className="s-badge s-badge--draft">Archivada</span>
                  <ArchiveToggle id={r.id} archived={true} action={setBrandArchivedAction} noun="la marca" />
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </>
  );
}
