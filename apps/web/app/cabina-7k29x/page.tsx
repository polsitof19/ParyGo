import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { optimizedImage } from '@/lib/imageUrl';
import { ArchiveToggle } from '@/components/manage/ArchiveToggle';
import { setBrandArchivedAction } from './brands/[slug]/actions';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const AVATAR_BG = ['#FF6A3D', '#5B6CFF', '#E8552A', '#2E9E6B', '#C7791A', '#8A5BFF'];
const bgFor = (s: string) => AVATAR_BG[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_BG.length];
const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase();

// Avatar de marca: logo real si está subido; si no, color de marca (o hash) + inicial.
function BrandAvatar({ name, slug, logoUrl, color }: { name: string; slug: string; logoUrl: string | null; color: string | null }) {
  return (
    <span className="s-avatar" style={{ background: logoUrl ? 'var(--white)' : (color || bgFor(slug)), overflow: 'hidden' }}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={optimizedImage(logoUrl, { width: 96, quality: 80 })} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} decoding="async" />
      ) : (
        initialOf(name)
      )}
    </span>
  );
}

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
};

export default async function SuperHome() {
  const supabase = createClient();

  const admin = createAdminClient();
  const HEAD = { count: 'exact' as const, head: true };
  const [{ data: brands }, { data: members }, { data: events }, { count: yapePending }, { count: pendingRequests }] = await Promise.all([
    supabase.from('brands').select('id, slug, name, event_balance, archived_at, theme_json').order('created_at', { ascending: false }),
    supabase.from('brand_members').select('brand_id, display_name, role').eq('role', 'brand_admin'),
    supabase.from('events').select('brand_id, is_published, archived_at'),
    // Yape por revisar + solicitudes pendientes — agregados cross-tenant (admin client), igual que /salud y /solicitudes.
    admin.from('orders').select('id', HEAD).eq('status', 'pending_yape_review'),
    admin.from('access_requests').select('id', HEAD).eq('status', 'pending'),
  ]);

  const ownerByBrand = new Map<string, string>();
  for (const m of members ?? []) if (!ownerByBrand.has(m.brand_id)) ownerByBrand.set(m.brand_id, m.display_name ?? '');
  const evByBrand = new Map<string, { total: number; pub: number }>();
  for (const e of events ?? []) {
    const cur = evByBrand.get(e.brand_id) ?? { total: 0, pub: 0 };
    cur.total += 1;
    // "Vendiendo" = publicado y NO archivado (alineado con /salud).
    if (e.is_published && !e.archived_at) cur.pub += 1;
    evByBrand.set(e.brand_id, cur);
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
    };
  });

  // Las archivadas van en su propia sección al final; no se mezclan con las activas.
  const rows = allRows.filter((r) => !r.archived);
  const archivedRows = allRows.filter((r) => r.archived);

  const noOwner = rows.filter((r) => !r.owner).length;
  const noSaldo = rows.filter((r) => r.event_balance === 0).length;
  const isAlert = (r: BrandRow) => !r.owner || r.event_balance === 0;

  // KPIs de plataforma (dashboard) — marcas activas, eventos vendiendo, Yape por revisar, solicitudes.
  const brandsActive = rows.length;
  const eventsSelling = rows.reduce((acc, r) => acc + r.eventsPublished, 0);
  const yapeReview = yapePending ?? 0;
  const pendingReqs = pendingRequests ?? 0;

  return (
    <>
      <div className="s-pagehead">
        <div>
          <span className="eyebrow">Plataforma</span>
          <h1 className="s-h1" style={{ marginTop: 4 }}>Marcas</h1>
          <p className="s-card__desc">
            {rows.length} marca{rows.length === 1 ? '' : 's'}
            {noOwner > 0 && <> · <span style={{ color: 'var(--alert)' }}>{noOwner} sin dueño</span></>}
            {noSaldo > 0 && <> · <span style={{ color: 'var(--alert)' }}>{noSaldo} sin saldo</span></>}
          </p>
        </div>
        <Link href="/cabina-7k29x/brands/new" className="s-btn s-btn--primary">
          <Plus className="h-4 w-4" /> Crear marca
        </Link>
      </div>

      {/* KPIs de plataforma */}
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
                    <th>Eventos</th>
                    <th>Dueño</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={isAlert(r) ? 's-row--alert' : undefined}>
                      <td>
                        <Link href={`/cabina-7k29x/brands/${r.slug}`} className="s-cell-brand s-rowlink" aria-label={`Abrir ${r.name}`}>
                          <BrandAvatar name={r.name} slug={r.slug} logoUrl={r.logoUrl} color={r.color} />
                          <span>
                            <span className="nm" style={{ display: 'block' }}>{r.name}</span>
                            <span className="sl">{r.slug}.parygo.com</span>
                          </span>
                        </Link>
                      </td>
                      <td className="num">
                        {r.event_balance === 0
                          ? <span className="s-badge s-badge--alert">0</span>
                          : <span className="s-saldo-num" style={r.event_balance === 1 ? { color: 'var(--warn)' } : undefined}>{r.event_balance}</span>}
                      </td>
                      <td>
                        {r.eventsTotal === 0
                          ? <span className="s-muted-3">Sin eventos</span>
                          : <span>{r.eventsTotal} <span className="s-muted-3">({r.eventsPublished} publ.)</span></span>}
                      </td>
                      <td>
                        {r.owner ? <span className="s-muted">{r.owner}</span> : <span className="s-badge s-badge--alert">Sin dueño</span>}
                      </td>
                      <td>
                        {r.eventsPublished > 0
                          ? <span className="s-badge s-badge--ok">Vendiendo</span>
                          : <span className="s-badge s-badge--draft">Sin publicar</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Móvil: cards */}
          <div className="s-brandcards">
            {rows.map((r) => (
              <Link key={r.id} href={`/cabina-7k29x/brands/${r.slug}`} className={`s-brandcard${isAlert(r) ? ' s-brandcard--alert' : ''}`}>
                <BrandAvatar name={r.name} slug={r.slug} logoUrl={r.logoUrl} color={r.color} />
                <span style={{ minWidth: 0 }}>
                  <span className="nm" style={{ display: 'block' }}>{r.name}</span>
                  <span className="meta">
                    {r.slug}.parygo.com · Saldo {r.event_balance} · {r.eventsTotal} evento{r.eventsTotal === 1 ? '' : 's'}
                  </span>
                  <span className="meta">{r.owner ?? 'Sin dueño asignado'}</span>
                </span>
                <span>
                  {r.eventsPublished > 0
                    ? <span className="s-badge s-badge--ok">Vendiendo</span>
                    : <span className="s-badge s-badge--draft">Sin publicar</span>}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Archivadas — sección aparte, solo lectura + desarchivar */}
      {archivedRows.length > 0 && (
        <div className="s-card" style={{ marginTop: 22 }}>
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
