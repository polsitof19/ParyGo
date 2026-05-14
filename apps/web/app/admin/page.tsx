import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPEN } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const user = await requireSession();
  const brandMembership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!brandMembership) return null;

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, slug, name')
    .eq('id', brandMembership.brandId)
    .single();

  if (!brand) return null;

  // Latest event for this brand
  const { data: events } = await supabase
    .from('events')
    .select('id, slug, name, starts_at, is_published')
    .eq('brand_id', brand.id)
    .order('starts_at', { ascending: false });

  const activeEvent = events?.find((e) => new Date(e.starts_at) > new Date(Date.now() - 24 * 3600_000)) ?? events?.[0];

  let stats = {
    paidCents: 0,
    paidOrders: 0,
    pendingYape: 0,
    ticketsIssued: 0,
  };

  if (activeEvent) {
    const [{ data: paid }, { count: pendingCount }, { count: ticketCount }] =
      await Promise.all([
        supabase
          .from('orders')
          .select('total_cents')
          .eq('event_id', activeEvent.id)
          .eq('status', 'paid'),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', activeEvent.id)
          .eq('status', 'pending_yape_review'),
        supabase
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', activeEvent.id)
          .is('invalidated_at', null),
      ]);
    stats = {
      paidCents: (paid ?? []).reduce((acc, o) => acc + (o.total_cents ?? 0), 0),
      paidOrders: paid?.length ?? 0,
      pendingYape: pendingCount ?? 0,
      ticketsIssued: ticketCount ?? 0,
    };
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ {brand.name} · TU PANEL ]
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight">
          {activeEvent ? activeEvent.name : 'Tu próximo evento'}
        </h1>
        {activeEvent && (
          <p className="text-sm text-muted-foreground">
            {new Date(activeEvent.starts_at).toLocaleString('es-PE', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            ·{' '}
            <span className={activeEvent.is_published ? 'text-green' : 'text-yellow'}>
              {activeEvent.is_published ? 'Publicado' : 'Borrador'}
            </span>
          </p>
        )}
      </header>

      {!activeEvent ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Todavía no te creamos tu evento. Te avisamos cuando esté listo —
            estimamos 24h desde que mandaste la info.
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription className="font-mono text-[10px] uppercase tracking-[0.18em]">
                  Ventas pagadas
                </CardDescription>
                <CardTitle className="font-display text-3xl">
                  {formatPEN(stats.paidCents)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription className="font-mono text-[10px] uppercase tracking-[0.18em]">
                  Órdenes pagadas
                </CardDescription>
                <CardTitle className="font-display text-3xl">
                  {stats.paidOrders}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription className="font-mono text-[10px] uppercase tracking-[0.18em]">
                  Yape pending
                </CardDescription>
                <CardTitle className="font-display text-3xl">
                  {stats.pendingYape}
                </CardTitle>
              </CardHeader>
              {stats.pendingYape > 0 && (
                <CardContent>
                  <Link
                    href="/admin/yape"
                    className="font-mono text-[10px] uppercase tracking-[0.18em] text-secondary underline-offset-4 hover:underline"
                  >
                    Revisar →
                  </Link>
                </CardContent>
              )}
            </Card>
            <Card>
              <CardHeader>
                <CardDescription className="font-mono text-[10px] uppercase tracking-[0.18em]">
                  Tickets emitidos
                </CardDescription>
                <CardTitle className="font-display text-3xl">
                  {stats.ticketsIssued}
                </CardTitle>
              </CardHeader>
            </Card>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <Link href="/admin/yape">
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <CardTitle>Revisar pagos Yape</CardTitle>
                  <CardDescription>
                    Verificá comprobantes pendientes contra tu app Yape y aprobá
                    o rechazá. {stats.pendingYape > 0 && `(${stats.pendingYape} esperando)`}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
