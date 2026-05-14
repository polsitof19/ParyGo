import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPEN } from '@/lib/utils';
import { publicEnv } from '@/lib/env';
import { TicketTypesEditor } from './TicketTypesEditor';
import { TogglePublishedButton } from './TogglePublishedButton';

export const dynamic = 'force-dynamic';

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: event } = await supabase
    .from('events')
    .select(`
      id, slug, name, description, starts_at, ends_at,
      venue_name, venue_address, min_age, is_published, refund_policy,
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
  const eventUrl = `https://${brand?.slug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/${event.slug}`;

  return (
    <div className="space-y-8">
      <Link
        href="/super/events"
        className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Volver
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            [ EVENTO · {brand?.slug} ]
          </p>
          <h1 className="font-display text-4xl uppercase leading-none tracking-tight">
            {event.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(event.starts_at).toLocaleString('es-PE', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {event.venue_name && <> · {event.venue_name}</>}
          </p>
          <a
            href={eventUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.18em] text-secondary underline-offset-4 hover:underline"
          >
            {eventUrl.replace('https://', '')}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <TogglePublishedButton eventId={event.id} isPublished={event.is_published} />
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.18em]">
              Ventas pagadas
            </CardDescription>
            <CardTitle className="font-display text-3xl">
              {formatPEN(grossCents)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.18em]">
              Órdenes pagadas
            </CardDescription>
            <CardTitle className="font-display text-3xl">{paidOrders.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.18em]">
              Tipos de entrada
            </CardDescription>
            <CardTitle className="font-display text-3xl">{ticketTypes?.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          [ TIPOS DE ENTRADA ]
        </h2>
        <TicketTypesEditor eventId={event.id} initial={ticketTypes ?? []} />
      </section>

      <section className="space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          [ INFO ]
        </h2>
        <Card>
          <CardContent className="space-y-3 py-6 text-sm">
            <Row label="Descripción">{event.description ?? '—'}</Row>
            <Row label="Dirección">{event.venue_address ?? '—'}</Row>
            <Row label="Edad mínima">{event.min_age}+</Row>
            <Row label="Refund policy">{event.refund_policy ?? '—'}</Row>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[160px_1fr] sm:gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}
