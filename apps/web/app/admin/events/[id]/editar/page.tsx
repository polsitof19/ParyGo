import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { EventCoverUploader } from '../EventCoverUploader';
import { EditEventForm } from './EditEventForms';
import { PostponeEvent } from './PostponeEvent';
import { CloneEventButton } from './CloneEventButton';
import { CourtesyForm } from './CourtesyForm';
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
    .select('id, brand_id, name, description, starts_at, venue_name, venue_address, venue_maps_url, require_age_confirmation, require_dni, send_reminder, min_age, cover_url, is_published, archived_at')
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

  // Tipos activos para el selector de cortesías.
  const { data: courtesyTypes } = await admin
    .from('ticket_types')
    .select('id, name')
    .eq('event_id', event.id)
    .eq('is_active', true)
    .order('sort_order');

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <span className="eyebrow">Editar evento</span>
        <h2 className="s-h2" style={{ marginTop: 2 }}>Datos del evento</h2>
        <p className="s-card__desc">
          {impersonating
            ? 'Estás viendo este evento en solo lectura. No puedes editarlo desde aquí.'
            : 'Los cambios se ven al instante en la página pública.'}
        </p>
      </div>
      {impersonating && (
        <p className="s-banner" style={{ background: 'var(--cream-2)', color: 'var(--ink-2)', marginBottom: 14 }} role="status">
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
          minAge={event.min_age ?? 18}
          isPublished={event.is_published}
          hasSales={hasSales}
          readOnly={impersonating}
        />
      </div>

      {/* Postergar: solo cuando hay ventas (fecha bloqueada arriba) y no en solo lectura. */}
      {event.is_published && hasSales && !impersonating && (
        <div style={{ marginTop: 16 }}>
          <PostponeEvent eventId={event.id} startsLocal={toLimaLocal(event.starts_at)} />
        </div>
      )}

      {/* Clonar evento (cualquier evento, no en solo lectura). */}
      {!impersonating && (
        <div style={{ marginTop: 16 }}>
          <CloneEventButton eventId={event.id} />
        </div>
      )}

      {/* Cortesías / VIP: emitir N entradas gratis a un email. Escritura → oculto
          en solo lectura (el action además deniega impersonación server-side). */}
      {!impersonating && (
        <>
          <h2 className="s-h2" style={{ margin: '24px 0 12px' }}>Cortesías</h2>
          <div className="s-card">
            <p className="s-card__desc" style={{ marginBottom: 14 }}>
              Emití entradas de cortesía de un tipo y enviáselas por email a quien quieras (ej. invitados, prensa, RR.PP.). Son entradas reales, escaneables en puerta, y <strong>descuentan del aforo</strong>.
            </p>
            <CourtesyForm eventId={event.id} ticketTypes={courtesyTypes ?? []} />
          </div>
        </>
      )}

      <h2 className="s-h2" style={{ margin: '24px 0 12px' }}>Flyer</h2>
      <div className="s-card"><EventCoverUploader eventId={event.id} currentUrl={event.cover_url} readOnly={impersonating} /></div>

      {/* Zona de gestión — archivar / eliminar. Todo escritura → oculto en solo lectura. */}
      {!impersonating && (
        <>
          <h2 className="s-h2" style={{ margin: '24px 0 12px' }}>Zona de gestión</h2>
          <div className="s-card">
            <div className="s-card__head">
              <div>
                <h3 className="s-h2" style={{ fontSize: 16 }}>Archivar evento</h3>
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

            <h3 className="s-h2" style={{ fontSize: 16 }}>Eliminar definitivamente</h3>
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
        </>
      )}
    </>
  );
}
