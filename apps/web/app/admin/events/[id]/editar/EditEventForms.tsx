'use client';

import { useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { updateEventAction, updateTicketTypeAction, createTicketTypeAction, type EditState } from '../edit-actions';

export type TtRow = { id: string; name: string; priceCents: number; capacity: number; sold: number; isUnlimited: boolean; isActive: boolean };

const initial: EditState = { ok: false, message: null };

function Banner({ state }: { state: EditState }) {
  if (!state.message) return null;
  return <p className={state.ok ? 's-banner s-banner--ok' : 's-banner s-banner--err'} style={{ marginTop: 12 }}>{state.message}</p>;
}
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="s-btn s-btn--primary s-btn--sm" disabled={pending}>{pending ? 'Guardando…' : label}</button>;
}

export function EditEventForm(p: { eventId: string; name: string; description: string; startsLocal: string; venueName: string; venueAddress: string; venueMapsUrl: string; requireAgeConfirmation: boolean; requireDni: boolean; sendReminder: boolean; collectAttendeeNames: boolean; allowTransfer: boolean; minAge: number; isPublished?: boolean; hasSales?: boolean; readOnly?: boolean }) {
  const [state, action] = useFormState(updateEventAction, initial);
  const dateRef = useRef<HTMLInputElement>(null);
  const ro = Boolean(p.readOnly);
  const dateLocked = Boolean(p.isPublished && p.hasSales) || ro;
  // Publicado SIN ventas: la fecha se puede cambiar pero avisamos antes de guardar.
  // Publicado CON ventas: input readOnly + el server rechaza igual (defensa real).
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (dateLocked) return;
    if (p.isPublished && dateRef.current && dateRef.current.value !== p.startsLocal) {
      if (!confirm('Este evento está publicado. Cambiar la fecha actualizará lo que ve la gente. ¿Continuar?')) {
        e.preventDefault();
      }
    }
  };
  return (
    <form action={action} onSubmit={onSubmit} className="s-stack" style={{ gap: 12 }}>
      <input type="hidden" name="event_id" value={p.eventId} />
      <div className="s-field"><label className="s-label" htmlFor="ev-name">Nombre</label>
        <input id="ev-name" name="name" defaultValue={p.name} className="s-input" required disabled={ro} /></div>
      <div className="s-field"><label className="s-label" htmlFor="ev-desc">Descripción</label>
        <textarea id="ev-desc" name="description" defaultValue={p.description} className="s-input" rows={3} style={{ resize: 'vertical' }} disabled={ro} /></div>
      <div className="s-form-grid">
        <div className="s-field"><label className="s-label" htmlFor="ev-date">Fecha y hora{dateLocked && !ro && <span className="s-muted" style={{ fontWeight: 500 }}> · bloqueada, hay ventas</span>}</label>
          <input ref={dateRef} id="ev-date" name="starts_at" type="datetime-local" defaultValue={p.startsLocal} className="s-input" required readOnly={dateLocked} disabled={ro} title={dateLocked ? 'No editable: ya hay entradas vendidas con esta fecha' : undefined} />
          {dateLocked && !ro && <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>No puedes cambiar la fecha: ya hay entradas vendidas con esta fecha.</p>}</div>
        <div className="s-field"><label className="s-label" htmlFor="ev-age">Edad mínima</label>
          <input id="ev-age" name="min_age" type="number" min={0} max={99} defaultValue={p.minAge} className="s-input" disabled={ro} /></div>
      </div>
      <div className="s-field"><label className="s-label" htmlFor="ev-vname">Lugar (nombre)</label>
        <input id="ev-vname" name="venue_name" defaultValue={p.venueName} className="s-input" disabled={ro} /></div>
      <div className="s-field"><label className="s-label" htmlFor="ev-vaddr">Dirección</label>
        <input id="ev-vaddr" name="venue_address" defaultValue={p.venueAddress} className="s-input" disabled={ro} />
        <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Si la cargás, mostramos el mapa de Google en la página pública.</p></div>
      <div className="s-field"><label className="s-label" htmlFor="ev-vmaps">Enlace de Google Maps (opcional)</label>
        <input id="ev-vmaps" name="venue_maps_url" type="url" defaultValue={p.venueMapsUrl} placeholder="https://maps.app.goo.gl/..." className="s-input" disabled={ro} />
        <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Para el botón "Cómo llegar". Pegá el enlace de tu local (debe empezar con https://).</p></div>
      <div className="s-field">
        <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="require_age_confirmation" defaultChecked={p.requireAgeConfirmation} disabled={ro} />
          <span>Pedir confirmación de edad (+{p.minAge}) en el checkout</span>
        </label>
        <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Por defecto desactivado. Activalo si tu evento lo requiere legalmente (ej. alcohol).</p>
      </div>
      <div className="s-field">
        <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="require_dni" defaultChecked={p.requireDni} disabled={ro} />
          <span>Pedir documento de identidad (DNI/CE) en el checkout</span>
        </label>
        <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Por defecto activado. Sirve para validar identidad en la puerta. Desactivalo si no lo necesitás.</p>
      </div>
      <div className="s-field">
        <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="send_reminder" defaultChecked={p.sendReminder} disabled={ro} />
          <span>Enviar recordatorio por email ~24h antes del evento</span>
        </label>
        <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Por defecto desactivado. Si lo activás, cada comprador con entrada válida recibe un recordatorio automático el día previo (una sola vez).</p>
      </div>
      <div className="s-field">
        <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="collect_attendee_names" defaultChecked={p.collectAttendeeNames} disabled={ro} />
          <span>Pedir el nombre de cada asistente en el checkout</span>
        </label>
        <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Por defecto desactivado. Si lo activás, el comprador puede poner un nombre por entrada (aparece en cada QR). Opcional para el comprador.</p>
      </div>
      <div className="s-field">
        <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="allow_transfer" defaultChecked={p.allowTransfer} disabled={ro} />
          <span>Permitir transferir / regalar entradas</span>
        </label>
        <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Por defecto desactivado. Si lo activás, cada comprador puede pasar su entrada a otra persona desde su QR (se reemite el QR y se avisa al nuevo dueño por email).</p>
      </div>
      <Banner state={state} />
      {!ro && <div className="s-form-actions"><Submit label="Guardar evento" /></div>}
    </form>
  );
}

export function TicketTypeEditor({ eventId, tt, readOnly = false }: { eventId: string; tt: TtRow; readOnly?: boolean }) {
  const [state, action] = useFormState(updateTicketTypeAction, initial);
  const hasSales = tt.sold > 0;
  const ro = readOnly;
  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="ticket_type_id" value={tt.id} />
      <div className="s-card__head" style={{ marginBottom: 10 }}>
        <span className="a-evrow__name" style={{ fontSize: 16 }}>{tt.name}</span>
        <span className="s-muted" style={{ fontSize: 13 }}>{tt.isUnlimited ? 'Ilimitado' : `${tt.sold}/${tt.capacity} vendidas`}</span>
      </div>
      <div className="s-form-grid">
        <div className="s-field"><label className="s-label">Nombre</label>
          <input name="name" defaultValue={tt.name} className="s-input" disabled={ro} /></div>
        <div className="s-field">
          <label className="s-label">Precio (S/){hasSales && !ro && <span className="s-muted" style={{ fontWeight: 500 }}> · congelado, hay ventas</span>}</label>
          <input name="price_soles" type="number" step="0.5" min={0} defaultValue={(tt.priceCents / 100).toFixed(2)} className="s-input" disabled={hasSales || ro} title={hasSales ? 'No editable: ya tiene ventas' : undefined} />
        </div>
      </div>
      <div className="s-form-grid s-field">
        <div className="s-field">
          <label className="s-label">Capacidad{!tt.isUnlimited && tt.sold > 0 && !ro && <span className="s-muted" style={{ fontWeight: 500 }}> · mín. {tt.sold} (vendidas)</span>}</label>
          <input name="capacity" type="number" min={Math.max(1, tt.sold)} defaultValue={tt.capacity || ''} className="s-input" disabled={tt.isUnlimited || ro} />
        </div>
        <div className="s-field" style={{ display: 'flex', gap: 16, alignItems: 'flex-end', paddingBottom: 6 }}>
          <label className="s-check" style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}><input type="checkbox" name="is_unlimited" defaultChecked={tt.isUnlimited} disabled={ro} /> Ilimitado</label>
          <label className="s-check" style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}><input type="checkbox" name="is_active" defaultChecked={tt.isActive} disabled={ro} /> Activo</label>
        </div>
      </div>
      <Banner state={state} />
      {!ro && <div className="s-form-actions"><Submit label="Guardar tipo" /></div>}
    </form>
  );
}

export function NewTicketTypeForm({ eventId }: { eventId: string }) {
  const [state, action] = useFormState(createTicketTypeAction, initial);
  return (
    <form action={action} className="s-stack" style={{ gap: 12 }} key={state.ok ? Math.random() : 'f'}>
      <input type="hidden" name="event_id" value={eventId} />
      <div className="s-form-grid">
        <div className="s-field"><label className="s-label">Nombre</label><input name="name" placeholder="VIP" className="s-input" required /></div>
        <div className="s-field"><label className="s-label">Precio (S/)</label><input name="price_soles" type="number" step="0.5" min={0} placeholder="50" className="s-input" required /></div>
      </div>
      <div className="s-form-grid">
        <div className="s-field"><label className="s-label">Capacidad</label><input name="capacity" type="number" min={1} placeholder="100" className="s-input" /></div>
        <div className="s-field" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
          <label className="s-check" style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}><input type="checkbox" name="is_unlimited" /> Stock ilimitado</label>
        </div>
      </div>
      <Banner state={state} />
      <div className="s-form-actions"><Submit label="Crear tipo" /></div>
    </form>
  );
}
