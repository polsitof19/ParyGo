import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatPEN } from '@/lib/utils';
import { publicEnv } from '@/lib/env';
import { TicketTypesEditor } from './TicketTypesEditor';
import { TogglePublishedButton } from './TogglePublishedButton';
import { EditEventForm } from '../../../admin/events/[id]/editar/EditEventForms';
import { EventCoverUploader } from '../../../admin/events/[id]/EventCoverUploader';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// UTC → "YYYY-MM-DDTHH:mm" en hora de Lima (UTC-5) para el input datetime-local.
function toLimaLocal(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 16);
}

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: event } = await supabase
    .from('events')
    .select(`
      id, slug, name, description, starts_at, ends_at,
      venue_name, venue_address, min_age, is_published, refund_policy, cover_url,
      brand_id,
      brand:brands ( slug, name )
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (!event) notFound();

  const brand = Array.isArray(event.brand) ? event.brand[0] : event.brand;

  const [{ data: ticketTypes }, { data: orders }] = await Promise.all([
    supabase
      .from('ticket_types')
      .select('id, name, description, price_cents, capacity, sold, sort_order, color_hex, is_active')
      .eq('event_id', event.id)
      .order('sort_order'),
    supabase
      .from('orders')
      .select('id, status, total_cents', { count: 'exact' })
      .eq('event_id', event.id)
      .limit(5000),
  ]);

  const paidOrders = orders?.filter((o) => o.status === 'paid') ?? [];
  const grossCents = paidOrders.reduce((acc, o) => acc + (o.total_cents ?? 0), 0);
  const hasSales = (ticketTypes ?? []).some((t) => (t.sold ?? 0) > 0);
  const eventUrl = `https://${brand?.slug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/${event.slug}`;

  return (
    <>
      <Link href="/cabina-7k29x/events" className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> Eventos
      </Link>

      <header className="s-pagehead">
        <div>
          <span className="eyebrow">
            Evento · {brand?.name ?? brand?.slug}
            <span className={`s-badge ${event.is_published ? 's-badge--ok' : 's-badge--draft'}`} style={{ marginLeft: 10, verticalAlign: 'middle' }}>
              {event.is_published ? 'Publicado' : 'Borrador'}
            </span>
          </span>
          <h1 className="s-h1" style={{ marginTop: 6 }}>{event.name}</h1>
          <p className="s-card__desc">
            {new Date(event.starts_at).toLocaleString('es-PE', {
              weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
            })}
            {event.venue_name && <> · {event.venue_name}</>}
          </p>
          <a href={eventUrl} target="_blank" rel="noopener noreferrer" className="s-brandhead__url" style={{ marginTop: 6 }}>
            {eventUrl.replace('https://', '')}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <TogglePublishedButton eventId={event.id} isPublished={event.is_published} />
      </header>

      <div className="s-stats">
        <div className="s-stat">
          <span className="s-stat__label">Ventas pagadas</span>
          <span className="s-stat__value" style={{ fontSize: 26 }}>{formatPEN(grossCents)}</span>
        </div>
        <div className="s-stat">
          <span className="s-stat__label">Órdenes pagadas</span>
          <span className="s-stat__value">{paidOrders.length}</span>
        </div>
        <div className="s-stat">
          <span className="s-stat__label">Tipos de entrada</span>
          <span className="s-stat__value">{ticketTypes?.length ?? 0}</span>
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Tipos de entrada</h2>
        <TicketTypesEditor eventId={event.id} initial={ticketTypes ?? []} />
      </div>

      <div className="s-card" style={{ marginTop: 22 }}>
        <h2 className="s-h2">Datos del evento</h2>
        <p className="s-card__desc" style={{ marginBottom: 14 }}>Los cambios se ven al instante en la página pública. El precio y el slug no se editan acá.</p>
        <EditEventForm
          eventId={event.id}
          name={event.name}
          description={event.description ?? ''}
          startsLocal={toLimaLocal(event.starts_at)}
          venueName={event.venue_name ?? ''}
          venueAddress={event.venue_address ?? ''}
          minAge={event.min_age ?? 18}
          isPublished={event.is_published}
          hasSales={hasSales}
        />
      </div>

      <div className="s-card" style={{ marginTop: 22 }}>
        <h2 className="s-h2">Flyer</h2>
        <div style={{ marginTop: 14 }}>
          <EventCoverUploader eventId={event.id} currentUrl={event.cover_url} />
        </div>
      </div>

      {event.refund_policy && (
        <div className="s-card" style={{ marginTop: 22 }}>
          <h2 className="s-h2">Refund policy</h2>
          <p className="s-card__desc" style={{ marginTop: 8 }}>{event.refund_policy}</p>
        </div>
      )}
    </>
  );
}
