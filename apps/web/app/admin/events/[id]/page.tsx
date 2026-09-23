import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BarChart3, ChevronRight, DoorOpen, ExternalLink, Gift, PencilLine, ReceiptText, Ticket, Trophy, Users } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';
import { optimizedImage } from '@/lib/imageUrl';
import { EventButtons } from './QuickActions';
import { PublishControl } from './PublishControl';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// EL EVENTO (pedido de Paul, 2026-09-23): arriba el flyer y el nombre, los dos
// botones del día (escáner · link) y, si hay, los Yapes esperando. Debajo, un
// MENÚ de secciones en el orden en que se usan: primero Estadísticas, después
// Entradas (ver y crear), y así. Cada sección es su propia pantalla con
// "volver" al evento: nada de pestañas con sub-pestañas.
export default async function AdminEventPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();
  const impersonating = ctx.soloLectura;

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, slug, name, starts_at, venue_name, cover_url, is_published, is_free, brand:brands ( slug )')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  const [{ data: pend }, { data: types }] = await Promise.all([
    admin
      .from('yape_proofs')
      .select('id, order:orders!yape_proofs_order_id_fkey ( event_id )')
      .eq('brand_id', event.brand_id)
      .eq('status', 'pending_review'),
    admin.from('ticket_types').select('id, name, color_hex, is_active').eq('event_id', event.id).order('sort_order'),
  ]);
  const yapes = ((pend ?? []) as { order: { event_id: string } | null }[]).filter((p) => p.order?.event_id === event.id).length;
  const tipos = types ?? [];

  const brandSlug = (Array.isArray(event.brand) ? event.brand[0] : event.brand)?.slug ?? null;
  const publicUrl = brandSlug ? `https://${brandSlug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/${event.slug}` : null;
  const base = `/admin/events/${event.id}`;
  const cuando = new Date(event.starts_at).toLocaleString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

  const menu: { href: string; t: string; d: string; Icono: typeof BarChart3; badge?: number; solo?: boolean }[] = [
    { href: `${base}/estadisticas`, t: 'Estadísticas', d: 'Cuánto vendiste, por tipo de entrada, por día y quién entró', Icono: BarChart3 },
    { href: `${base}/entradas`, t: 'Entradas', d: tipos.length ? `${tipos.length} tipo${tipos.length === 1 ? '' : 's'} · ver, editar o crear` : 'Crea la primera para poder vender', Icono: Ticket },
    { href: `${base}/yape`, t: 'Yapes', d: yapes ? 'Comprobantes esperando tu aprobación' : 'Aprobar o rechazar comprobantes', Icono: ReceiptText, badge: yapes },
    { href: `${base}/cortesias`, t: 'Cortesías y códigos', d: 'Entradas de regalo y códigos para reclamar', Icono: Gift, solo: true },
    { href: `${base}/clientes`, t: 'Compradores', d: 'Buscar, reenviar entradas y exportar la lista', Icono: Users },
    { href: `${base}/promotores`, t: 'Promotores', d: 'Ventas por código de RR.PP.', Icono: Trophy },
    { href: `${base}/accesos`, t: 'Puerta', d: 'Quién entró, en vivo, y tu equipo de puerta', Icono: DoorOpen },
    { href: `${base}/editar`, t: 'Datos del evento', d: 'Nombre, fecha, lugar, flyer y opciones', Icono: PencilLine },
  ];

  return (
    <>
      <header className="a-evhero">
        <span className="a-evhero__flyer">
          {event.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={optimizedImage(event.cover_url, { width: 360, quality: 75 })} alt={`Flyer de ${event.name}`} decoding="async" />
          ) : (
            <span aria-hidden="true">{(event.name.trim()[0] ?? '?').toUpperCase()}</span>
          )}
        </span>
        <div className="a-evhero__id">
          <h1 className="a-evhero__title">{event.name}</h1>
          <p className="a-evhero__when">{cuando}{event.venue_name && <><br />{event.venue_name}</>}</p>
          {publicUrl && event.is_published && (
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="a-publink">
              Ver página pública <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </div>
      </header>

      <PublishControl eventId={event.id} isPublished={!!event.is_published} impersonating={impersonating} />

      {yapes > 0 && (
        <div className="s-due" role="status">
          <div className="s-due__txt">
            <span className="s-due__k">Por revisar</span>
            <span className="s-due__n">{yapes} Yape{yapes === 1 ? '' : 's'} por aprobar</span>
            <span className="s-due__sub">Hay gente esperando su QR.</span>
          </div>
          <Link href={`${base}/yape`} className="s-btn s-btn--primary s-btn--sm">Revisar Yapes</Link>
        </div>
      )}

      {event.is_published && (
        <EventButtons publicUrl={publicUrl} isPublished={!!event.is_published} scannerPrimary={yapes === 0} readOnly={impersonating} />
      )}

      <nav className="a-menu" aria-label="Secciones del evento">
        <ul>
          {menu.filter((m) => !(m.solo && impersonating)).map(({ href, t, d, Icono, badge }) => (
            <li key={href}>
              <Link href={href} className="a-menu__item">
                <Icono className="a-menu__ico" aria-hidden="true" />
                <span className="a-menu__txt">
                  <span className="a-menu__t">{t}</span>
                  <span className="a-menu__d">{d}</span>
                </span>
                {badge ? <span className="a-nav__count" aria-label={`${badge} por revisar`}>{badge}</span> : null}
                <ChevronRight className="a-menu__chev" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
