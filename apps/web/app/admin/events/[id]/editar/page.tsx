import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Gift, ShieldAlert } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { EventCoverUploader } from '../EventCoverUploader';
import { EditEventForm } from './EditEventForms';
import { PostponeEvent } from './PostponeEvent';
import { CancelEvent } from './CancelEvent';
import { CloneEventButton } from './CloneEventButton';
import { ArchiveToggle } from '@/components/manage/ArchiveToggle';
import { DangerDeleteButton } from '@/components/manage/DangerDeleteButton';
import { setEventArchivedAction, deleteEventAction } from '../edit-actions';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// UTC → "YYYY-MM-DDTHH:mm" en hora de Lima (UTC-5) para el input datetime-local.
function toLimaLocal(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 16);
}

export default async function EditEventPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();
  const impersonating = ctx.impersonating;

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, name, description, starts_at, venue_name, venue_address, venue_maps_url, require_age_confirmation, require_dni, send_reminder, collect_attendee_names, allow_transfer, min_age, cover_url, is_published, archived_at, cancelled_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  // ¿Hay alguna venta? (define si la fecha queda bloqueada)
  // Además contamos órdenes y tickets para saber si el evento se puede ELIMINAR
  // (solo eventos vacíos: 0 órdenes y 0 tickets).
  const [{ count: soldCount }, { count: orderCount }, { count: ticketCount }] = await Promise.all([
    admin.from('ticket_types').select('id', { count: 'exact', head: true }).eq('event_id', event.id).gt('sold', 0),
    admin.from('orders').select('id', { count: 'exact', head: true }).eq('event_id', event.id),
    admin.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', event.id),
  ]);
  const hasSales = (soldCount ?? 0) > 0;
  const canDelete = (orderCount ?? 0) === 0 && (ticketCount ?? 0) === 0;


  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <span className="eyebrow">Mi evento</span>
        <h2 className="s-h2" style={{ marginTop: 6 }}>Datos del evento</h2>
        <p className="s-card__desc">
          {impersonating
            ? 'Estás viendo este evento en solo lectura. No puedes editarlo desde aquí.'
            : 'Los cambios se ven al instante en la página pública.'}
        </p>
      </div>
      {impersonating && (
        <p className="s-banner" style={{ marginBottom: 14 }} role="status">
          Solo lectura — los datos se muestran tal cual, sin posibilidad de editarlos.
        </p>
      )}
      <div className="s-card">
        <EditEventForm
          eventId={event.id}
          name={event.name}
          description={event.description ?? ''}
          startsLocal={toLimaLocal(event.starts_at)}
          venueName={event.venue_name ?? ''}
          venueAddress={event.venue_address ?? ''}
          venueMapsUrl={event.venue_maps_url ?? ''}
          requireAgeConfirmation={event.require_age_confirmation ?? false}
          requireDni={event.require_dni ?? true}
          sendReminder={event.send_reminder ?? false}
          collectAttendeeNames={event.collect_attendee_names ?? false}
          allowTransfer={event.allow_transfer ?? false}
          minAge={event.min_age ?? 18}
          isPublished={event.is_published}
          hasSales={hasSales}
          readOnly={impersonating}
        />
      </div>

      <h2 className="s-h2" style={{ margin: '24px 0 12px' }}>Flyer</h2>
      <div className="s-card"><EventCoverUploader eventId={event.id} currentUrl={event.cover_url} readOnly={impersonating} /></div>

      {/* Las cortesías ya no viven acá: no son "editar el evento". */}
      {!impersonating && (
        <p className="s-card__desc" style={{ marginTop: 14 }}>
          ¿Buscas las cortesías? Ahora están en <Link href={`/admin/events/${event.id}/cortesias`} className="s-textlink"><Gift className="h-3.5 w-3.5" style={{ display: 'inline', verticalAlign: '-2px' }} /> Ventas y pagos → Cortesías</Link>.
        </p>
      )}

      {/* Zona de gestión — lo raro o destructivo, PLEGADO al final para que no
          conviva con la edición diaria: postergar, clonar, cancelar, archivar,
          eliminar. Todo escritura → oculto en solo lectura. */}
      {!impersonating && (
        <details className="a-accordion a-accordion--danger" style={{ marginTop: 24 }}>
          <summary>
            <span className="a-accordion__title"><ShieldAlert className="h-4 w-4" /> Zona de gestión</span>
            <span className="a-accordion__hint">Postergar, clonar, cancelar, archivar o eliminar el evento</span>
          </summary>
          <div className="a-accordion__body">
            {/* Postergar: solo cuando hay ventas (la fecha de arriba queda bloqueada). */}
            {event.is_published && hasSales && (
              <div style={{ marginTop: 16 }}>
                <PostponeEvent eventId={event.id} startsLocal={toLimaLocal(event.starts_at)} />
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <CloneEventButton eventId={event.id} />
            </div>
            {!event.archived_at && (
              <div style={{ marginTop: 16 }}>
                <CancelEvent eventId={event.id} eventName={event.name} cancelled={!!event.cancelled_at} />
              </div>
            )}
            <div className="s-card" style={{ marginTop: 16 }}>
              <div className="s-card__head">
                <div>
                  <h3 className="s-h3">Archivar evento</h3>
                  <p className="s-card__desc">
                    {event.archived_at
                      ? 'Este evento está archivado: no se vende y no aparece en público. Puedes desarchivarlo cuando quieras.'
                      : 'Al archivar deja de venderse y desaparece del público, pero conservas todo su historial. Es reversible.'}
                  </p>
                </div>
                <ArchiveToggle
                  id={event.id}
                  archived={!!event.archived_at}
                  action={setEventArchivedAction}
                  noun="el evento"
                />
              </div>

              <div className="s-divider" />

              <h3 className="s-h3">Eliminar definitivamente</h3>
              <p className="s-card__desc" style={{ marginBottom: 12 }}>
                Borra el evento para siempre. Solo es posible si no tiene ninguna venta.
              </p>
              <DangerDeleteButton
                id={event.id}
                name={event.name}
                action={deleteEventAction}
                canDelete={canDelete}
                noun="el evento"
              />
            </div>
          </div>
        </details>
      )}
    </>
  );
}
