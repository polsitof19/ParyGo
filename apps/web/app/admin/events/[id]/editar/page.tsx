import { notFound } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
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
import { textosPanel } from '@/lib/idiomaServer';

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
  const impersonating = ctx.soloLectura;
  const { t } = await textosPanel();

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, name, description, starts_at, venue_name, venue_address, venue_maps_url, require_age_confirmation, require_dni, send_reminder, collect_attendee_names, allow_transfer, min_age, max_per_person, cover_url, is_published, archived_at, cancelled_at, is_free')
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
      {/* DATOS DEL EVENTO (desde 2026-09-23 las entradas tienen su propia
          sección): nombre, fecha y lugar → el flyer → lo raro (postergar,
          clonar, cancelar, archivar), plegado al final. */}
      <div id="datos" className="a-anchor" style={{ marginBottom: 14 }}>
        <h1 className="s-h1">{t('Datos del evento', 'Event details')}</h1>
        <p className="s-card__desc">
          {impersonating
            ? t('Estás viendo este evento en solo lectura. No puedes editarlo desde aquí.', 'You are viewing this event in read-only mode. You cannot edit it from here.')
            : t('Los cambios se ven al instante en la página pública.', 'Changes are visible instantly on the public page.')}
        </p>
      </div>
      {impersonating && (
        <p className="s-banner" style={{ marginBottom: 14 }} role="status">
          {t('Solo lectura — los datos se muestran tal cual, sin posibilidad de editarlos.', 'Read-only — data is shown as is, with no way to edit it.')}
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
          isFree={event.is_free ?? false}
          maxPerPerson={event.max_per_person ?? null}
          sendReminder={event.send_reminder ?? false}
          collectAttendeeNames={event.collect_attendee_names ?? false}
          allowTransfer={event.allow_transfer ?? false}
          minAge={event.min_age ?? 18}
          isPublished={event.is_published}
          hasSales={hasSales}
          readOnly={impersonating}
        />
      </div>

      <section id="flyer" className="a-anchor s-section">
        <h2 className="s-h2" style={{ marginBottom: 12 }}>{t('Flyer', 'Flyer')}</h2>
        <div className="s-card"><EventCoverUploader eventId={event.id} currentUrl={event.cover_url} readOnly={impersonating} /></div>
      </section>

      {/* Zona de gestión — lo raro o destructivo, PLEGADO al final para que no
          conviva con la edición diaria: postergar, clonar, cancelar, archivar,
          eliminar. Todo escritura → oculto en solo lectura. */}
      {!impersonating && (
        <details className="a-accordion a-accordion--danger" style={{ marginTop: 24 }}>
          <summary>
            <span className="a-accordion__title"><ShieldAlert className="h-4 w-4" /> {t('Zona de gestión', 'Management zone')}</span>
            <span className="a-accordion__hint">{t('Postergar, clonar, cancelar, archivar o eliminar el evento', 'Reschedule, duplicate, cancel, archive or delete the event')}</span>
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
                  <h3 className="s-h3">{t('Archivar evento', 'Archive event')}</h3>
                  <p className="s-card__desc">
                    {event.archived_at
                      ? t('Este evento está archivado: no se vende y no aparece en público. Puedes desarchivarlo cuando quieras.', 'This event is archived: it does not sell and does not appear publicly. You can unarchive it whenever you want.')
                      : t('Al archivar deja de venderse y desaparece del público, pero conservas todo su historial. Es reversible.', 'When archived it stops selling and disappears from the public, but you keep its whole history. It is reversible.')}
                  </p>
                </div>
                <ArchiveToggle
                  id={event.id}
                  archived={!!event.archived_at}
                  action={setEventArchivedAction}
                  noun={t('el evento', 'the event')}
                />
              </div>

              <div className="s-divider" />

              <h3 className="s-h3">{t('Eliminar definitivamente', 'Delete permanently')}</h3>
              <p className="s-card__desc" style={{ marginBottom: 12 }}>
                {t('Borra el evento para siempre. Solo es posible si no tiene ninguna venta.', 'Deletes the event forever. Only possible if it has no sales.')}
              </p>
              <DangerDeleteButton
                id={event.id}
                name={event.name}
                action={deleteEventAction}
                canDelete={canDelete}
                noun={t('el evento', 'the event')}
              />
            </div>
          </div>
        </details>
      )}
    </>
  );
}
