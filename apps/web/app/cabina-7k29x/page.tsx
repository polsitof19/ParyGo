import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const AVATAR_BG = ['#FF6A3D', '#5B6CFF', '#E8552A', '#2E9E6B', '#C7791A', '#8A5BFF'];
const bgFor = (s: string) => AVATAR_BG[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_BG.length];
const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase();

type BrandRow = {
  id: string;
  slug: string;
  name: string;
  event_balance: number;
  owner: string | null;
  eventsTotal: number;
  eventsPublished: number;
};

export default async function SuperHome() {
  const supabase = createClient();

  const [{ data: brands }, { data: members }, { data: events }] = await Promise.all([
    supabase.from('brands').select('id, slug, name, event_balance').order('created_at', { ascending: false }),
    supabase.from('brand_members').select('brand_id, display_name, role').eq('role', 'brand_admin'),
    supabase.from('events').select('brand_id, is_published'),
  ]);

  const ownerByBrand = new Map<string, string>();
  for (const m of members ?? []) if (!ownerByBrand.has(m.brand_id)) ownerByBrand.set(m.brand_id, m.display_name ?? '');
  const evByBrand = new Map<string, { total: number; pub: number }>();
  for (const e of events ?? []) {
    const cur = evByBrand.get(e.brand_id) ?? { total: 0, pub: 0 };
    cur.total += 1;
    if (e.is_published) cur.pub += 1;
    evByBrand.set(e.brand_id, cur);
  }

  const rows: BrandRow[] = (brands ?? []).map((b) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    event_balance: b.event_balance ?? 0,
    owner: ownerByBrand.get(b.id) || null,
    eventsTotal: evByBrand.get(b.id)?.total ?? 0,
    eventsPublished: evByBrand.get(b.id)?.pub ?? 0,
  }));

  const noOwner = rows.filter((r) => !r.owner).length;
  const noSaldo = rows.filter((r) => r.event_balance === 0).length;
  const isAlert = (r: BrandRow) => !r.owner || r.event_balance === 0;

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

      {rows.length === 0 ? (
        <div className="s-card"><p className="s-empty">Todavía no hay marcas. Creá la primera.</p></div>
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
                          <span className="s-avatar" style={{ background: bgFor(r.slug) }}>{initialOf(r.name)}</span>
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
                <span className="s-avatar" style={{ background: bgFor(r.slug) }}>{initialOf(r.name)}</span>
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
    </>
  );
}
