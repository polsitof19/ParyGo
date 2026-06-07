import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ExternalLink, Plus, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { InviteBrandAdmin } from './InviteBrandAdmin';
import { SetBrandAdminPassword } from './SetBrandAdminPassword';
import { LoadPackForm } from './LoadPackForm';
import { publicEnv } from '@/lib/env';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const AVATAR_BG = ['#FF6A3D', '#5B6CFF', '#E8552A', '#2E9E6B', '#C7791A', '#8A5BFF'];
const bgFor = (s: string) => AVATAR_BG[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_BG.length];
const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase();

export default async function BrandDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, slug, name, contact_email, whatsapp_e164, yape_number, yape_holder, theme_json, created_at, event_balance')
    .eq('slug', params.slug)
    .maybeSingle();

  if (!brand) notFound();

  const [{ data: events }, { data: members }] = await Promise.all([
    supabase
      .from('events')
      .select('id, slug, name, starts_at, is_published')
      .eq('brand_id', brand.id)
      .order('starts_at', { ascending: false }),
    supabase
      .from('brand_members')
      .select('id, role, display_name, user_id, created_at')
      .eq('brand_id', brand.id),
  ]);

  const brandUrl = `https://${brand.slug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}`;
  const admins = (members ?? []).filter((m) => m.role === 'brand_admin');
  const owner = admins[0]?.display_name ?? null;
  const balance = brand.event_balance ?? 0;
  const published = (events ?? []).filter((e) => e.is_published).length;

  return (
    <>
      <Link href="/cabina-7k29x" className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> Marcas
      </Link>

      {/* Cabecera: avatar + nombre + dominio + entrar a la marca */}
      <header className="s-brandhead">
        <span className="s-avatar s-avatar--lg" style={{ background: bgFor(brand.slug) }}>
          {initialOf(brand.name)}
        </span>
        <div className="s-brandhead__id">
          <h1 className="s-h1">{brand.name}</h1>
          <a href={brandUrl} target="_blank" rel="noopener noreferrer" className="s-brandhead__url">
            {brandUrl.replace('https://', '')}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <button type="button" className="s-btn s-btn--peri" disabled title="Próximamente">
          Entrar a la marca
        </button>
      </header>

      {/* Métricas: saldo · eventos · dueño */}
      <div className="s-stats">
        <div className={`s-stat${balance === 0 ? ' s-stat--alert' : ''}`}>
          <span className="s-stat__label">Saldo de eventos</span>
          <span className="s-stat__value">{balance}</span>
          <span className="s-stat__hint">
            {balance === 0 ? 'Cargá un pack para crear eventos' : `evento${balance === 1 ? '' : 's'} por crear`}
          </span>
        </div>
        <div className="s-stat">
          <span className="s-stat__label">Eventos</span>
          <span className="s-stat__value">{events?.length ?? 0}</span>
          <span className="s-stat__hint">{published} publicado{published === 1 ? '' : 's'}</span>
        </div>
        <div className={`s-stat${owner ? '' : ' s-stat--alert'}`}>
          <span className="s-stat__label">Dueño</span>
          {owner ? (
            <span className="s-stat__owner">
              <span className="s-avatar s-avatar--sm" style={{ background: bgFor(owner) }}>{initialOf(owner)}</span>
              <span className="s-stat__owner-email">{owner}</span>
            </span>
          ) : (
            <span className="s-badge s-badge--alert" style={{ marginTop: 6 }}>Sin dueño</span>
          )}
        </div>
      </div>

      {/* Acciones principales */}
      <div className="s-actionbar">
        <span className="s-actionbar__lead">Acciones</span>
        <div className="s-actionbar__btns">
          <Link href={`/cabina-7k29x/events/new?brand=${brand.slug}`} className="s-btn s-btn--soft">
            <Plus className="h-4 w-4" /> Crear evento
          </Link>
        </div>
      </div>

      <div className="s-grid-2">
        {/* Cargar saldo */}
        <div className="s-card">
          <h2 className="s-h2">Cargar saldo</h2>
          <p className="s-card__desc">
            Cada evento creado consume 1. En 0 no se puede crear hasta cargar un pack.
          </p>
          <div style={{ marginTop: 14 }}>
            <LoadPackForm brandId={brand.id} slug={brand.slug} />
          </div>
        </div>

        {/* Configuración / contacto */}
        <div className="s-card">
          <h2 className="s-h2">Configuración</h2>
          <p className="s-card__desc">Datos de contacto y cobro de la marca.</p>
          <dl className="s-deflist" style={{ marginTop: 14 }}>
            <Row label="Email">{brand.contact_email ?? '—'}</Row>
            <Row label="WhatsApp">{brand.whatsapp_e164 ?? '—'}</Row>
            <Row label="Yape número">{brand.yape_number ?? '—'}</Row>
            <Row label="Yape titular">{brand.yape_holder ?? '—'}</Row>
          </dl>
        </div>
      </div>

      {/* Eventos */}
      <div className="s-card">
        <div className="s-card__head">
          <div>
            <h2 className="s-h2">Eventos</h2>
            <p className="s-card__desc">
              {events?.length ?? 0} evento{events?.length === 1 ? '' : 's'} de esta marca.
            </p>
          </div>
          <Link href={`/cabina-7k29x/events/new?brand=${brand.slug}`} className="s-btn s-btn--ghost">
            <Plus className="h-4 w-4" /> Nuevo
          </Link>
        </div>

        {!events || events.length === 0 ? (
          <p className="s-empty">Sin eventos todavía. Creá el primero.</p>
        ) : (
          <ul className="s-event-list">
            {events.map((e) => (
              <li key={e.id} className="s-event-row">
                <Link href={`/cabina-7k29x/events/${e.id}`} className="s-event-row__main">
                  <span className="s-event-row__name">{e.name}</span>
                  <span className="s-event-row__date">{new Date(e.starts_at).toLocaleString('es-PE')}</span>
                </Link>
                <span className={`s-badge ${e.is_published ? 's-badge--ok' : 's-badge--draft'}`}>
                  {e.is_published ? 'Publicado' : 'Borrador'}
                </span>
                <Link href={`/cabina-7k29x/events/${e.id}`} className="s-event-row__go" aria-label={`Abrir ${e.name}`}>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Dueño de la marca */}
      <div className="s-card">
        <h2 className="s-h2">Dueño de la marca</h2>
        <p className="s-card__desc">
          El brand admin entra con email y contraseña (la fija Paul) para editar eventos y ver sus ventas.
        </p>

        {admins.length > 0 ? (
          <ul className="s-owner-list" style={{ marginTop: 14 }}>
            {admins.map((m) => (
              <li key={m.id} className="s-owner-row">
                <div className="s-owner-row__id">
                  <span className="s-avatar s-avatar--sm" style={{ background: bgFor(m.display_name ?? m.id) }}>
                    {initialOf(m.display_name ?? '?')}
                  </span>
                  <span className="s-owner-row__email">{m.display_name ?? 'Brand admin'}</span>
                  <span className="s-badge s-badge--ok">Activo</span>
                </div>
                <SetBrandAdminPassword brandId={brand.id} userId={m.user_id} slug={brand.slug} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="s-empty" style={{ marginTop: 10 }}>Aún no hay dueño asignado.</p>
        )}

        <div style={{ marginTop: 16 }}>
          <InviteBrandAdmin brandId={brand.id} brandName={brand.name} />
        </div>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="s-defrow">
      <dt className="s-defrow__k">{label}</dt>
      <dd className="s-defrow__v">{children}</dd>
    </div>
  );
}
