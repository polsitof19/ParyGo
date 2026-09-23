'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ChevronDown, Plus } from 'lucide-react';
import { useFormFeedback } from '@/components/useFormFeedback';
import { formatPEN } from '@/lib/utils';
import { updateEventAction, updateTicketTypeAction, createTicketTypeAction, type EditState } from '../edit-actions';

export type TtRow = { id: string; name: string; description: string; priceCents: number; capacity: number; sold: number; isUnlimited: boolean; isActive: boolean; isCourtesy: boolean; bulkMinQty: number; bulkDiscountPct: number; colorHex: string | null };

// Campos de descuento por cantidad (compartidos entre crear y editar).
function BulkFields({ minQty, pct, disabled }: { minQty?: number; pct?: number; disabled?: boolean }) {
  return (
    <div className="s-form-grid">
      <div className="s-field">
        <label className="s-label">Descuento por cantidad — desde N entradas</label>
        <input name="bulk_min_qty" type="number" min={0} max={10} defaultValue={minQty || ''} placeholder="0 = sin descuento" className="s-input" disabled={disabled} />
      </div>
      <div className="s-field">
        <label className="s-label">% de descuento</label>
        <input name="bulk_discount_pct" type="number" min={0} max={90} defaultValue={pct || ''} placeholder="ej. 10" className="s-input" disabled={disabled} />
      </div>
    </div>
  );
}

const initial: EditState = { ok: false, message: null };

function Banner({ state }: { state: EditState }) {
  if (!state.message) return null;
  return <p className={state.ok ? 's-banner s-banner--ok' : 's-banner s-banner--err'} style={{ marginTop: 12 }}>{state.message}</p>;
}
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="s-btn s-btn--primary s-btn--sm" disabled={pending}>{pending ? 'Guardando…' : label}</button>;
}

export function EditEventForm(p: { eventId: string; name: string; description: string; startsLocal: string; venueName: string; venueAddress: string; venueMapsUrl: string; requireAgeConfirmation: boolean; requireDni: boolean; isFree: boolean; sendReminder: boolean; collectAttendeeNames: boolean; allowTransfer: boolean; minAge: number; maxPerPerson: number | null; isPublished?: boolean; hasSales?: boolean; readOnly?: boolean }) {
  const [state, action] = useFormFeedback(updateEventAction, initial);
  const dateRef = useRef<HTMLInputElement>(null);
  const ro = Boolean(p.readOnly);
  // El toast de resultado (también en mobile, donde el Banner queda fuera de
  // viewport) lo dispara useFormFeedback.
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
        <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Si la cargas, mostramos el mapa de Google en la página pública.</p></div>
      <div className="s-field"><label className="s-label" htmlFor="ev-vmaps">Enlace de Google Maps (opcional)</label>
        <input id="ev-vmaps" name="venue_maps_url" type="url" defaultValue={p.venueMapsUrl} placeholder="https://maps.app.goo.gl/..." className="s-input" disabled={ro} />
        <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Para el botón "Cómo llegar". Pega el enlace de tu local (debe empezar con https://).</p></div>
      <details className="s-details">
        <summary>Opciones del checkout y avisos (avanzado)</summary>
        <div className="s-field" style={{ marginTop: 12 }}>
          <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="require_age_confirmation" defaultChecked={p.requireAgeConfirmation} disabled={ro} />
            <span>Pedir confirmación de edad (+{p.minAge}) en el checkout</span>
          </label>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Por defecto desactivado. Actívalo si tu evento lo requiere legalmente (ej. alcohol).</p>
        </div>
        <div className="s-field">
          <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="require_dni" defaultChecked={p.requireDni} disabled={ro} />
            <span>Pedir documento de identidad (DNI/CE) en el checkout</span>
          </label>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Por defecto activado. Sirve para validar identidad en la puerta. Desactívalo si no lo necesitas.</p>
        </div>
        <div className="s-field">
          <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="is_free" defaultChecked={p.isFree} disabled={ro || p.hasSales} />
            <span>Evento gratis (entrada libre con registro)</span>
          </label>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            Por defecto desactivado. Actívalo solo si la entrada no se cobra: tus
            tipos en S/0 pasan a ofrecerse al público y la entrada se emite al
            instante, sin pago. Los tipos marcados como cortesía siguen sin
            aparecer — esos se siguen emitiendo desde tu panel.
            {p.hasSales && ' No se puede cambiar: este evento ya tiene ventas pagas, y marcarlo gratis diría "Gratis" en un evento que cobró.'}
          </p>
        </div>
        <div className="s-field">
          <label className="s-label" htmlFor="ev-maxpp">Máximo de entradas por persona</label>
          <input id="ev-maxpp" name="max_per_person" type="number" min={0} max={100} placeholder="Sin límite" defaultValue={p.maxPerPerson ?? ''} className="s-input" disabled={ro} />
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            Vacío = sin límite. Si pones un número, cada persona puede llevarse
            como máximo esa cantidad en todo el evento: se cuenta por correo Y
            por documento, así que cambiar de correo con el mismo documento no
            da más entradas. Sirve sobre todo en eventos gratis, donde sin tope
            unos pocos se llevan el aforo.
          </p>
        </div>
        <div className="s-field">
          <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="send_reminder" defaultChecked={p.sendReminder} disabled={ro} />
            <span>Enviar recordatorio por email ~24h antes del evento</span>
          </label>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Por defecto desactivado. Si lo activas, cada comprador con entrada válida recibe un recordatorio automático el día previo (una sola vez).</p>
        </div>
        <div className="s-field">
          <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="collect_attendee_names" defaultChecked={p.collectAttendeeNames} disabled={ro} />
            <span>Pedir el nombre de cada asistente en el checkout</span>
          </label>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Por defecto desactivado. Si lo activas, el comprador puede poner un nombre por entrada (aparece en cada QR). Opcional para el comprador.</p>
        </div>
        <div className="s-field">
          <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="allow_transfer" defaultChecked={p.allowTransfer} disabled={ro} />
            <span>Permitir transferir / regalar entradas</span>
          </label>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Por defecto desactivado. Si lo activas, cada comprador puede pasar su entrada a otra persona desde su QR (se reemite el QR y se avisa al nuevo dueño por email).</p>
        </div>
      </details>
      <Banner state={state} />
      {!ro && <div className="s-form-actions"><Submit label="Guardar datos del evento" /></div>}
    </form>
  );
}

// Precio S/0 en un tipo: ilimitado → bloqueado; con aforo → confirmación explícita
// (confirm_free=1). El server exige lo mismo y revalida; esto es solo UX.
// `previousPriceCents` = precio actual del tipo (no se reconfirma si ya era 0).
function guardFreePrice(e: React.FormEvent<HTMLFormElement>, previousPriceCents?: number) {
  const form = e.currentTarget;
  const priceEl = form.elements.namedItem('price_soles') as HTMLInputElement | null;
  const hidden = form.elements.namedItem('confirm_free') as HTMLInputElement | null;
  if (hidden) hidden.value = '';
  if (!priceEl || priceEl.disabled || priceEl.value === '') return;
  if (Math.round(parseFloat(priceEl.value) * 100) !== 0) return;
  const unlimited = (form.elements.namedItem('is_unlimited') as HTMLInputElement | null)?.checked;
  if (unlimited) {
    e.preventDefault();
    window.alert('Un tipo no puede ser gratis e ilimitado a la vez. Pon un cupo o un precio.');
    return;
  }
  if (previousPriceCents === 0) return;
  if (!window.confirm('Este tipo cuesta S/ 0. Los tipos gratis NO se venden en tu página: se emiten desde "Cortesías" y descuentan del aforo. ¿Confirmas?')) {
    e.preventDefault();
    return;
  }
  if (hidden) hidden.value = '1';
}

// Con la casilla "Gratis" marcada, esa casilla ES la confirmación del S/0
// (confirm_free=1): no hace falta el confirm(). Sin marcarla, un precio 0
// escrito a mano pasa por guardFreePrice como antes. El server revalida igual.
function guardPrice(e: React.FormEvent<HTMLFormElement>, free: boolean, previousPriceCents?: number) {
  if (!free) return guardFreePrice(e, previousPriceCents);
  const form = e.currentTarget;
  const hidden = form.elements.namedItem('confirm_free') as HTMLInputElement | null;
  const priceEl = form.elements.namedItem('price_soles') as HTMLInputElement | null;
  if (hidden) hidden.value = '';
  if (!priceEl || priceEl.disabled) return;
  if ((form.elements.namedItem('is_unlimited') as HTMLInputElement | null)?.checked) {
    e.preventDefault();
    window.alert('Una entrada no puede ser gratis y sin límite a la vez. Pon una capacidad o un precio.');
    return;
  }
  if (hidden) hidden.value = '1';
}

// Colores rápidos para el punto del tipo (decorativo: nunca lleva texto encima).
const SWATCHES = ['#FF1F8F', '#E8552A', '#F5B301', '#22A06B', '#2F6FEB', '#8B5CF6'];

function ColorField({ id, initial, disabled }: { id: string; initial: string | null; disabled?: boolean }) {
  const [color, setColor] = useState((initial ?? '').toUpperCase());
  return (
    <div className="s-field">
      <label className="s-label" htmlFor={id}>Color</label>
      <input type="hidden" name="color_hex" value={color} />
      <div className="a-tt-colors">
        <input id={id} type="color" className="s-colorpick" value={color || '#888888'} onChange={(e) => setColor(e.target.value.toUpperCase())} disabled={disabled} />
        {SWATCHES.map((c) => (
          <button key={c} type="button" className="a-tt-swatch" style={{ '--sw': c } as React.CSSProperties} aria-label={`Usar el color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} disabled={disabled} />
        ))}
        {color && !disabled && <button type="button" className="s-btn s-btn--ghost s-btn--sm" onClick={() => setColor('')}>Sin color</button>}
      </div>
      <p className="s-hint">Para reconocer esta entrada de un vistazo.</p>
    </div>
  );
}

function PriceField({ id, defaultSoles, free, onFree, locked, eventIsFree }: { id: string; defaultSoles?: string; free: boolean; onFree: (v: boolean) => void; locked?: boolean; eventIsFree: boolean }) {
  return (
    <div className="s-field">
      <label className="s-label" htmlFor={id}>Precio (S/){locked && <span className="s-muted" style={{ fontWeight: 500 }}> · congelado, hay ventas</span>}</label>
      {free
        ? <input type="hidden" name="price_soles" value="0" disabled={locked} />
        : <input id={id} name="price_soles" type="number" step="0.5" min={0} defaultValue={defaultSoles} placeholder="50" className="s-input" required={!locked} disabled={locked} title={locked ? 'No editable: ya tiene ventas' : undefined} />}
      <label className="s-check"><input type="checkbox" checked={free} onChange={(e) => onFree(e.target.checked)} disabled={locked} /> Gratis</label>
      {free && !eventIsFree && (
        <p className="s-hint">En un evento con precio, una entrada gratis es de cortesía: no se vende al público; la repartes desde Cortesías o con un código.</p>
      )}
    </div>
  );
}

// Una fila por tipo de entrada: plegada muestra lo que importa (color, nombre,
// precio, vendidas); abierta se edita y tiene SU botón de guardar.
export function TicketTypeEditor({ eventId, eventIsFree, tt, readOnly = false }: { eventId: string; eventIsFree: boolean; tt: TtRow; readOnly?: boolean }) {
  const [state, action] = useFormFeedback(updateTicketTypeAction, initial);
  const [free, setFree] = useState(tt.priceCents === 0);
  const hasSales = tt.sold > 0;
  const ro = readOnly;
  const price = tt.isCourtesy ? 'Cortesía' : tt.priceCents === 0 ? 'Gratis' : formatPEN(tt.priceCents);
  const stock = tt.isUnlimited ? `${tt.sold} vendidas · sin límite` : `${tt.sold} de ${tt.capacity} vendidas`;
  return (
    <details className="s-fold">
      <summary>
        <span className="a-tt-sum">
          <span className={tt.colorHex ? 'a-tt-dot a-tt-dot--on' : 'a-tt-dot'} style={tt.colorHex ? ({ '--sw': tt.colorHex } as React.CSSProperties) : undefined} aria-hidden="true" />
          <span className="a-tt-name">{tt.name}</span>
          <span className="a-tt-meta">{price} · {stock}{!tt.isActive && ' · pausada'}</span>
        </span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="s-fold__body">
        <form action={action} onSubmit={(e) => guardPrice(e, free, tt.priceCents)}>
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="ticket_type_id" value={tt.id} />
          <input type="hidden" name="confirm_free" defaultValue="" />
          <div className="s-form-grid">
            <div className="s-field"><label className="s-label" htmlFor={`tt-name-${tt.id}`}>Nombre</label>
              <input id={`tt-name-${tt.id}`} name="name" defaultValue={tt.name} className="s-input" disabled={ro} /></div>
            <PriceField id={`tt-price-${tt.id}`} defaultSoles={(tt.priceCents / 100).toFixed(2)} free={free} onFree={setFree} locked={hasSales || ro} eventIsFree={eventIsFree} />
          </div>
          <div className="s-form-grid">
            <div className="s-field">
              <label className="s-label" htmlFor={`tt-cap-${tt.id}`}>Capacidad{!tt.isUnlimited && tt.sold > 0 && !ro && <span className="s-muted" style={{ fontWeight: 500 }}> · mín. {tt.sold} (vendidas)</span>}</label>
              <input id={`tt-cap-${tt.id}`} name="capacity" type="number" min={Math.max(1, tt.sold)} defaultValue={tt.capacity || ''} className="s-input" disabled={tt.isUnlimited || ro} />
              <label className="s-check"><input type="checkbox" name="is_unlimited" defaultChecked={tt.isUnlimited} disabled={ro} /> Sin límite</label>
            </div>
            <ColorField id={`tt-color-${tt.id}`} initial={tt.colorHex} disabled={ro} />
          </div>
          <div className="s-field">
            <label className="s-check"><input type="checkbox" name="is_active" defaultChecked={tt.isActive} disabled={ro} /> A la venta</label>
            <p className="s-hint">Desmárcala para pausar esta entrada sin borrarla.</p>
          </div>
          <details className="s-details">
            <summary>Más opciones</summary>
            <div className="s-field">
              <label className="s-label" htmlFor={`tt-desc-${tt.id}`}>Descripción (opcional)</label>
              <textarea id={`tt-desc-${tt.id}`} name="description" defaultValue={tt.description} className="s-input" rows={2} maxLength={280} placeholder={'Barra libre toda la noche\nAcceso preferencial'} style={{ resize: 'vertical' }} disabled={ro} />
              <p className="s-hint">Se muestra debajo del nombre en el checkout. Una línea por beneficio. No afecta precio ni cantidad.</p>
            </div>
            <div className="s-field">
              <label className="s-check"><input type="checkbox" name="is_courtesy" defaultChecked={tt.isCourtesy} disabled={ro} /> Solo invitados (cortesía): no se muestra en tu página</label>
              <p className="s-hint">Solo para invitados: no se vende al público, ni en un evento gratis.</p>
            </div>
            <BulkFields minQty={tt.bulkMinQty} pct={tt.bulkDiscountPct} disabled={ro} />
          </details>
          <Banner state={state} />
          {!ro && <div className="s-form-actions"><Submit label={`Guardar cambios de ${tt.name}`} /></div>}
        </form>
      </div>
    </details>
  );
}

export function NewTicketTypeForm({ eventId, eventIsFree }: { eventId: string; eventIsFree: boolean }) {
  const [state, action] = useFormFeedback(createTicketTypeAction, initial);
  // Tras crear, el formulario se vacía (remonta con una key nueva).
  const [round, setRound] = useState(0);
  useEffect(() => { if (state.ok) setRound((r) => r + 1); }, [state]);
  return (
    <details className="s-fold">
      <summary>
        <span className="a-tt-sum">
          <Plus className="a-tt-plus" aria-hidden="true" />
          <span className="a-tt-name">Agregar tipo de entrada</span>
        </span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="s-fold__body">
        <NewTicketTypeFields key={round} eventId={eventId} eventIsFree={eventIsFree} action={action} />
        <Banner state={state} />
      </div>
    </details>
  );
}

function NewTicketTypeFields({ eventId, eventIsFree, action }: { eventId: string; eventIsFree: boolean; action: (fd: FormData) => void }) {
  const [free, setFree] = useState(false);
  return (
    <form action={action} onSubmit={(e) => guardPrice(e, free)}>
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="confirm_free" defaultValue="" />
      <div className="s-form-grid">
        <div className="s-field"><label className="s-label" htmlFor="tt-new-name">Nombre</label>
          <input id="tt-new-name" name="name" placeholder="VIP" className="s-input" required /></div>
        <PriceField id="tt-new-price" free={free} onFree={setFree} eventIsFree={eventIsFree} />
      </div>
      <div className="s-form-grid">
        <div className="s-field">
          <label className="s-label" htmlFor="tt-new-cap">Capacidad</label>
          <input id="tt-new-cap" name="capacity" type="number" min={1} placeholder="100" className="s-input" />
          <label className="s-check"><input type="checkbox" name="is_unlimited" /> Sin límite</label>
        </div>
        <ColorField id="tt-new-color" initial={null} />
      </div>
      <details className="s-details">
        <summary>Más opciones</summary>
        <div className="s-field">
          <label className="s-label" htmlFor="tt-new-desc">Descripción (opcional)</label>
          <textarea id="tt-new-desc" name="description" className="s-input" rows={2} maxLength={280} placeholder={'Barra libre toda la noche\nAcceso preferencial'} style={{ resize: 'vertical' }} />
          <p className="s-hint">Se muestra debajo del nombre en el checkout. Una línea por beneficio.</p>
        </div>
        <BulkFields />
      </details>
      <div className="s-form-actions"><Submit label="Agregar tipo de entrada" /></div>
    </form>
  );
}
