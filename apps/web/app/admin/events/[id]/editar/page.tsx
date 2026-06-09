import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { EventCoverUploader } from '../EventCoverUploader';
import { EditEventForm, TicketTypeEditor, NewTicketTypeForm, type TtRow } from './EditEventForms';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// UTC → "YYYY-MM-DDTHH:mm" en hora de Lima (UTC-5) para el input datetime-local.
function toLimaLocal(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 16);
}

export default async function EditEventPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) notFound();

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, name, description, starts_at, venue_name, venue_address, min_age, cover_url')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== membership.brandId) notFound();

  const { data: tts } = await admin
    .from('ticket_types')
    .select('id, name, price_cents, capacity, sold, is_unlimited, is_active, sort_order')
    .eq('event_id', event.id)
    .order('sort_order');

  const rows: TtRow[] = (tts ?? []).map((t) => ({
    id: t.id, name: t.name, priceCents: t.price_cents, capacity: t.capacity ?? 0,
    sold: t.sold ?? 0, isUnlimited: t.is_unlimited, isActive: t.is_active,
  }));

  return (
    <>
      <Link href={`/admin/events/${event.id}`} className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> {event.name}
      </Link>
      <header className="s-pagehead">
        <div>
          <span className="eyebrow">Editar</span>
          <h1 className="s-h1" style={{ marginTop: 4 }}>Editar evento</h1>
          <p className="s-card__desc">Los cambios se ven al instante en la página pública. El precio de los que ya compraron queda congelado.</p>
        </div>
      </header>

      <section style={{ marginBottom: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Datos del evento</h2>
        <div className="s-card">
          <EditEventForm
            eventId={event.id}
            name={event.name}
            description={event.description ?? ''}
            startsLocal={toLimaLocal(event.starts_at)}
            venueName={event.venue_name ?? ''}
            venueAddress={event.venue_address ?? ''}
            minAge={event.min_age ?? 18}
          />
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Flyer</h2>
        <div className="s-card"><EventCoverUploader eventId={event.id} currentUrl={event.cover_url} /></div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Tipos de entrada</h2>
        <div className="s-stack" style={{ gap: 10 }}>
          {rows.map((t) => (
            <div key={t.id} className="s-card"><TicketTypeEditor eventId={event.id} tt={t} /></div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Nuevo tipo de entrada</h2>
        <div className="s-card"><NewTicketTypeForm eventId={event.id} /></div>
      </section>
    </>
  );
}
