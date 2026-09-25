import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BarChart3, ChevronRight, DoorOpen, ExternalLink, Gift, PencilLine, ReceiptText, Ticket, Trophy, Users } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { todas } from '@/lib/todas';
import { publicEnv } from '@/lib/env';
import { optimizedImage } from '@/lib/imageUrl';
import { textosPanel } from '@/lib/idiomaServer';
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
  const { t, loc } = await textosPanel();
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
    todas((a, b) => admin
      .from('yape_proofs')
      // Solo los de ESTE evento (antes se traían los de toda la marca).
      .select('id, order:orders!yape_proofs_order_id_fkey!inner ( event_id )')
      .eq('brand_id', event.brand_id)
      .eq('order.event_id', event.id)
      .eq('status', 'pending_review')
      .order('id')
      .range(a, b)).then((data) => ({ data })),
    admin.from('ticket_types').select('id, name, color_hex, is_active').eq('event_id', event.id).order('sort_order'),
  ]);
  const yapes = ((pend ?? []) as { order: { event_id: string } | null }[]).filter((p) => p.order?.event_id === event.id).length;
  const tipos = types ?? [];

  const brandSlug = (Array.isArray(event.brand) ? event.brand[0] : event.brand)?.slug ?? null;
  const publicUrl = brandSlug ? `https://${brandSlug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/${event.slug}` : null;
  const base = `/admin/events/${event.id}`;
  const cuando = new Date(event.starts_at).toLocaleString(loc, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

  const menu: { href: string; t: string; d: string; Icono: typeof BarChart3; badge?: number; solo?: boolean }[] = [
    { href: `${base}/estadisticas`, t: t('Estadísticas', 'Statistics'), d: t('Cuánto vendiste, por tipo de entrada, por día y quién entró', 'How much you sold, by ticket type, by day, and who checked in'), Icono: BarChart3 },
    { href: `${base}/entradas`, t: t('Entradas', 'Tickets'), d: tipos.length ? t(`${tipos.length} tipo${tipos.length === 1 ? '' : 's'} · ver, editar o crear`, `${tipos.length} type${tipos.length === 1 ? '' : 's'} · view, edit or create`) : t('Crea la primera para poder vender', 'Create the first one to start selling'), Icono: Ticket },
    { href: `${base}/yape`, t: t('Yapes', 'Yapes'), d: yapes ? t('Comprobantes esperando tu aprobación', 'Receipts waiting for your approval') : t('Aprobar o rechazar comprobantes', 'Approve or reject receipts'), Icono: ReceiptText, badge: yapes },
    { href: `${base}/cortesias`, t: t('Cortesías y códigos', 'Complimentary tickets and codes'), d: t('Entradas de regalo y códigos para reclamar', 'Gift tickets and claim codes'), Icono: Gift, solo: true },
    { href: `${base}/clientes`, t: t('Compradores', 'Buyers'), d: t('Buscar, reenviar entradas y exportar la lista', 'Search, resend tickets and export the list'), Icono: Users },
    { href: `${base}/promotores`, t: t('Promotores', 'Promoters'), d: t('Ventas por código de RR.PP.', 'Sales by promoter code'), Icono: Trophy },
    { href: `${base}/accesos`, t: t('Puerta', 'Door'), d: t('Quién entró, en vivo, y tu equipo de puerta', 'Who checked in, live, and your door team'), Icono: DoorOpen },
    { href: `${base}/editar`, t: t('Datos del evento', 'Event details'), d: t('Nombre, fecha, lugar, flyer y opciones', 'Name, date, venue, flyer and options'), Icono: PencilLine },
  ];

  return (
    <>
      <header className="a-evhero">
        <span className="a-evhero__flyer">
          {event.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={optimizedImage(event.cover_url, { width: 360, quality: 75 })} alt={t(`Flyer de ${event.name}`, `Flyer of ${event.name}`)} decoding="async" />
          ) : (
            <span aria-hidden="true">{(event.name.trim()[0] ?? '?').toUpperCase()}</span>
          )}
        </span>
        <div className="a-evhero__id">
          <h1 className="a-evhero__title">{event.name}</h1>
          <p className="a-evhero__when">{cuando}{event.venue_name && <><br />{event.venue_name}</>}</p>
          {publicUrl && event.is_published && (
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="a-publink">
              {t('Ver página pública', 'View public page')} <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </div>
      </header>

      <PublishControl eventId={event.id} isPublished={!!event.is_published} impersonating={impersonating} />

      {yapes > 0 && (
        <div className="s-due" role="status">
          <div className="s-due__txt">
            <span className="s-due__k">{t('Por revisar', 'To review')}</span>
            <span className="s-due__n">{t(`${yapes} Yape${yapes === 1 ? '' : 's'} por aprobar`, `${yapes} Yape${yapes === 1 ? '' : 's'} to approve`)}</span>
            <span className="s-due__sub">{t('Hay gente esperando su QR.', 'There are people waiting for their QR.')}</span>
          </div>
          <Link href={`${base}/yape`} className="s-btn s-btn--primary s-btn--sm">{t('Revisar Yapes', 'Review Yapes')}</Link>
        </div>
      )}

      {event.is_published && (
        <EventButtons publicUrl={publicUrl} isPublished={!!event.is_published} scannerPrimary={yapes === 0} readOnly={impersonating} />
      )}

      <nav className="a-menu" aria-label={t('Secciones del evento', 'Event sections')}>
        <ul>
          {menu.filter((m) => !(m.solo && impersonating)).map(({ href, t: label, d, Icono, badge }) => (
            <li key={href}>
              <Link href={href} className="a-menu__item">
                <Icono className="a-menu__ico" aria-hidden="true" />
                <span className="a-menu__txt">
                  <span className="a-menu__t">{label}</span>
                  <span className="a-menu__d">{d}</span>
                </span>
                {badge ? <span className="a-nav__count" aria-label={t(`${badge} por revisar`, `${badge} to review`)}>{badge}</span> : null}
                <ChevronRight className="a-menu__chev" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
