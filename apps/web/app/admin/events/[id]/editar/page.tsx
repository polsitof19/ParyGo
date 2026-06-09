import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { EventCoverUploader } from '../EventCoverUploader';
import { EditEventForm } from './EditEventForms';

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

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <span className="eyebrow">Editar evento</span>
        <h2 className="s-h2" style={{ marginTop: 2 }}>Datos del evento</h2>
        <p className="s-card__desc">Los cambios se ven al instante en la página pública.</p>
      </div>
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

      <h2 className="s-h2" style={{ margin: '24px 0 12px' }}>Flyer</h2>
      <div className="s-card"><EventCoverUploader eventId={event.id} currentUrl={event.cover_url} /></div>
    </>
  );
}
