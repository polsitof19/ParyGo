import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';
import { EventTabs } from './EventTabs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Layout compartido de un evento: back + cabecera + pestañas. Cada apartado
// (resumen/editar/entradas/clientes/accesos/yape) renderiza solo su contenido.
export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) notFound();

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, slug, name, is_published, starts_at, venue_name, brand:brands ( slug )')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== membership.brandId) notFound();

  // Yapes pendientes de ESTE evento (para el badge de la pestaña).
  const { data: pendingProofs } = await admin
    .from('yape_proofs')
    .select('id, order:orders!yape_proofs_order_id_fkey ( event_id )')
    .eq('brand_id', event.brand_id)
    .eq('status', 'pending_review');
  const yapePending = ((pendingProofs ?? []) as { order: { event_id: string } | null }[])
    .filter((p) => p.order?.event_id === event.id).length;

  const brand = Array.isArray(event.brand) ? event.brand[0] : event.brand;
  const brandUrl = brand?.slug ? `https://${brand.slug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/${event.slug}` : null;

  return (
    <>
      <Link href="/admin" className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> Tus eventos
      </Link>
      <header className="s-pagehead">
        <div>
          <span className="eyebrow">
            Evento
            <span className={`s-badge ${event.is_published ? 's-badge--ok' : 's-badge--draft'}`} style={{ marginLeft: 10, verticalAlign: 'middle' }}>
              {event.is_published ? 'Publicado' : 'Borrador'}
            </span>
          </span>
          <h1 className="s-h1" style={{ marginTop: 6 }}>{event.name}</h1>
          <p className="s-card__desc">
            {new Date(event.starts_at).toLocaleString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
            {event.venue_name && <> · {event.venue_name}</>}
          </p>
          {brandUrl && event.is_published && (
            <a href={brandUrl} target="_blank" rel="noopener noreferrer" className="s-brandhead__url" style={{ marginTop: 6 }}>
              Ver página pública <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </header>
      <EventTabs eventId={event.id} yapePending={yapePending} />
      <div style={{ marginTop: 18 }}>{children}</div>
    </>
  );
}
