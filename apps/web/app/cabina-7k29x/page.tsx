import Link from 'next/link';
import { Plus, Wallet, CalendarDays } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
  const [{ data: brands }, { data: members }, { data: events }, { data: paidOrders }, { count: yapePending }, { count: pendingRequests }] = await Promise.all([
    supabase.from('brands').select('id, slug, name, event_balance, archived_at, theme_json').order('created_at', { ascending: false }),
    supabase.from('brand_members').select('brand_id, display_name, role').eq('role', 'brand_admin'),
    // starts_at y name vienen en la MISMA consulta que ya existía: el "próximo
    // evento" de cada marca no cuesta un viaje extra.
    supabase.from('events').select('brand_id, name, starts_at, is_published, archived_at'),
    // Última venta por marca. Es la única consulta nueva del dashboard.
    // Ordenada por paid_at DESC y acotada: la primera aparición de cada marca
    // es su última venta. Límite explícito de 1000 porque PostgREST corta por
    // su cuenta y un corte sin orden daría fechas al azar. Con el orden, el
    // único caso degradado es una marca cuya última venta sea más vieja que la
    // venta nº1000 de TODA la plataforma: se vería como "Sin ventas". Hoy hay
    // 10 órdenes pagadas en total (medido en prod), así que no aplica; cuando
    // se acerque, esto pide un RPC que agregue en SQL.
    admin.from('orders').select('brand_id, paid_at').eq('status', 'paid').not('paid_at', 'is', null)
      .order('paid_at', { ascending: false }).limit(1000),
    // Yape por revisar + solicitudes pendientes — agregados cross-tenant (admin client), igual que /salud y /solicitudes.
    admin.from('orders').select('id', HEAD).eq('status', 'pending_yape_review'),
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

  const noOwner = rows.filter((r) => !r.owner).length;
  const noSaldo = rows.filter((r) => r.event_balance === 0).length;

  // KPIs de plataforma (dashboard) — marcas activas, eventos vendiendo, Yape por revisar, solicitudes.
  const brandsActive = rows.length;
  const eventsSelling = rows.reduce((acc, r) => acc + r.eventsPublished, 0);
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

  return (
    <>
      <div className="s-pagehead">
        <div>
          <span className="eyebrow">Plataforma</span>
          <h1 className="s-h1">Marcas</h1>
          <p className="s-card__desc">
            {rows.length} marca{rows.length === 1 ? '' : 's'}
            {noOwner > 0 && <> · {noOwner} sin dueño</>}
            {noSaldo > 0 && <> · {noSaldo} sin saldo</>}
          </p>
        </div>
        <Link href="/cabina-7k29x/brands/new" className="s-btn s-btn--primary">
          <Plus className="h-4 w-4" /> Crear marca
        </Link>
      </div>

      {/* KPIs de plataforma. Las dos primeras son inventario (informativas);
          las dos últimas son trabajo pendiente del super admin. El color solo
          aparece cuando hay algo que hacer: en cero se ven todas iguales. */}
      <div className="s-stats-4" style={{ marginBottom: 18 }}>
        <div className="s-stat">
          <span className="s-stat__label">Marcas activas</span>
          <span className="s-stat__value">{brandsActive}</span>
        </div>
        <div className="s-stat">
          <span className="s-stat__label">Eventos vendiendo</span>
          <span className="s-stat__value">{eventsSelling}</span>
        </div>
        <Link href="/cabina-7k29x/salud" className={`s-stat${yapeReview > 0 ? ' s-stat--alert' : ''}`}>
          <span className="s-stat__label">Yape por revisar</span>
          <span className="s-stat__value">{yapeReview}</span>
        </Link>
        <Link href="/cabina-7k29x/solicitudes" className={`s-stat${pendingReqs > 0 ? ' s-stat--alert' : ''}`}>
          <span className="s-stat__label">Solicitudes pendientes</span>
          <span className="s-stat__value">{pendingReqs}</span>
        </Link>
      </div>

      {allRows.length === 0 ? (
        <div className="s-card"><p className="s-empty">Todavía no hay marcas. Creá la primera.</p></div>
      ) : rows.length === 0 ? (
        <div className="s-card"><p className="s-empty">Todas las marcas están archivadas. Mirá la sección “Archivadas” más abajo.</p></div>
      ) : (
        <>
          {/* Desktop: tabla densa */}
          <div className="s-table-wrap">
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
                            <span className="nm" style={{ display: 'block' }}>{r.name}</span>
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
                          ? <span className="s-muted">{r.owner}</span>
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
                    <span className="nm" style={{ display: 'block' }}>{r.name}</span>
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

      {/* Archivadas — sección aparte, solo lectura + desarchivar */}
      {archivedRows.length > 0 && (
        <div className="s-card s-section">
          <div className="s-card__head">
            <div>
              <h2 className="s-h2">Archivadas</h2>
              <p className="s-card__desc">
                {archivedRows.length} marca{archivedRows.length === 1 ? '' : 's'} archivada{archivedRows.length === 1 ? '' : 's'}.
                No aparecen en público y sus eventos no se venden. Podés desarchivarlas cuando quieras.
              </p>
            </div>
          </div>
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
      )}
    </>
  );
}
