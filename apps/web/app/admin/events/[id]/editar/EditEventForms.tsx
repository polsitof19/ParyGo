'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ChevronDown, ChevronUp, Plus, Link2, Lock, MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useFormFeedback } from '@/components/useFormFeedback';
import { formatPEN } from '@/lib/utils';
import { updateEventAction, updateTicketTypeAction, createTicketTypeAction, setTicketTypePrivateAction, moveTicketTypeAction, type EditState } from '../edit-actions';
import { useTextos } from '@/components/IdiomaPanel';
import type { Textos } from '@/lib/idioma';

export type TtRow = { id: string; name: string; description: string; priceCents: number; capacity: number; sold: number; isUnlimited: boolean; isActive: boolean; isCourtesy: boolean; bulkMinQty: number; bulkDiscountPct: number; colorHex: string | null };

// Campos de descuento por cantidad (compartidos entre crear y editar).
function BulkFields({ minQty, pct, disabled }: { minQty?: number; pct?: number; disabled?: boolean }) {
  const { t } = useTextos();
  return (
    <div className="s-form-grid">
      <div className="s-field">
        <label className="s-label">{t('Descuento por cantidad — desde N entradas', 'Bulk discount — from N tickets')}</label>
        <input name="bulk_min_qty" type="number" min={0} max={10} defaultValue={minQty || ''} placeholder={t('0 = sin descuento', '0 = no discount')} className="s-input" disabled={disabled} />
      </div>
      <div className="s-field">
        <label className="s-label">{t('% de descuento', '% discount')}</label>
        <input name="bulk_discount_pct" type="number" min={0} max={90} defaultValue={pct || ''} placeholder={t('ej. 10', 'e.g. 10')} className="s-input" disabled={disabled} />
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
  const { t } = useTextos();
  const { pending } = useFormStatus();
  return <button type="submit" className="s-btn s-btn--primary s-btn--sm" disabled={pending}>{pending ? t('Guardando…', 'Saving…') : label}</button>;
}

export function EditEventForm(p: { eventId: string; name: string; description: string; startsLocal: string; venueName: string; venueAddress: string; venueMapsUrl: string; requireAgeConfirmation: boolean; requireDni: boolean; isFree: boolean; sendReminder: boolean; collectAttendeeNames: boolean; allowTransfer: boolean; minAge: number; maxPerPerson: number | null; isPublished?: boolean; hasSales?: boolean; readOnly?: boolean }) {
  const { t } = useTextos();
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
      if (!confirm(t('Este evento está publicado. Cambiar la fecha actualizará lo que ve la gente. ¿Continuar?', 'This event is published. Changing the date will update what people see. Continue?'))) {
        e.preventDefault();
      }
    }
  };
  return (
    <form action={action} onSubmit={onSubmit} className="s-stack" style={{ gap: 12 }}>
      <input type="hidden" name="event_id" value={p.eventId} />
      <div className="s-field"><label className="s-label" htmlFor="ev-name">{t('Nombre', 'Name')}</label>
        <input id="ev-name" name="name" defaultValue={p.name} className="s-input" required disabled={ro} /></div>
      <div className="s-field"><label className="s-label" htmlFor="ev-desc">{t('Descripción', 'Description')}</label>
        <textarea id="ev-desc" name="description" defaultValue={p.description} className="s-input" rows={3} style={{ resize: 'vertical' }} disabled={ro} /></div>
      <div className="s-form-grid">
        <div className="s-field"><label className="s-label" htmlFor="ev-date">{t('Fecha y hora', 'Date and time')}{dateLocked && !ro && <span className="s-muted" style={{ fontWeight: 500 }}> · {t('bloqueada, hay ventas', 'locked, there are sales')}</span>}</label>
          <input ref={dateRef} id="ev-date" name="starts_at" type="datetime-local" defaultValue={p.startsLocal} className="s-input" required readOnly={dateLocked} disabled={ro} title={dateLocked ? t('No editable: ya hay entradas vendidas con esta fecha', 'Not editable: tickets have already been sold with this date') : undefined} />
          {dateLocked && !ro && <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t('No puedes cambiar la fecha: ya hay entradas vendidas con esta fecha.', 'You cannot change the date: tickets have already been sold with this date.')}</p>}</div>
        <div className="s-field"><label className="s-label" htmlFor="ev-age">{t('Edad mínima', 'Minimum age')}</label>
          <input id="ev-age" name="min_age" type="number" min={0} max={99} defaultValue={p.minAge} className="s-input" disabled={ro} /></div>
      </div>
      <div className="s-field"><label className="s-label" htmlFor="ev-vname">{t('Lugar (nombre)', 'Venue (name)')}</label>
        <input id="ev-vname" name="venue_name" defaultValue={p.venueName} className="s-input" disabled={ro} /></div>
      <div className="s-field"><label className="s-label" htmlFor="ev-vaddr">{t('Dirección', 'Address')}</label>
        <input id="ev-vaddr" name="venue_address" defaultValue={p.venueAddress} className="s-input" disabled={ro} />
        <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t('Si la cargas, mostramos el mapa de Google en la página pública.', 'If you fill it in, we show the Google map on the public page.')}</p></div>
      <div className="s-field"><label className="s-label" htmlFor="ev-vmaps">{t('Enlace de Google Maps (opcional)', 'Google Maps link (optional)')}</label>
        <input id="ev-vmaps" name="venue_maps_url" type="url" defaultValue={p.venueMapsUrl} placeholder="https://maps.app.goo.gl/..." className="s-input" disabled={ro} />
        <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t('Para el botón "Cómo llegar". Pega el enlace de tu local (debe empezar con https://).', 'For the "Get directions" button. Paste your venue\'s link (must start with https://).')}</p></div>
      <details className="s-details">
        <summary>{t('Opciones del checkout y avisos (avanzado)', 'Checkout and notification options (advanced)')}</summary>
        <div className="s-field" style={{ marginTop: 12 }}>
          <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="require_age_confirmation" defaultChecked={p.requireAgeConfirmation} disabled={ro} />
            <span>{t(`Pedir confirmación de edad (+${p.minAge}) en el checkout`, `Ask for age confirmation (+${p.minAge}) at checkout`)}</span>
          </label>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t('Por defecto desactivado. Actívalo si tu evento lo requiere legalmente (ej. alcohol).', 'Off by default. Turn it on if your event requires it legally (e.g. alcohol).')}</p>
        </div>
        <div className="s-field">
          <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="require_dni" defaultChecked={p.requireDni} disabled={ro} />
            <span>{t('Pedir documento de identidad (DNI/CE) en el checkout', 'Ask for an ID document (DNI/CE) at checkout')}</span>
          </label>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t('Por defecto activado. Sirve para validar identidad en la puerta. Desactívalo si no lo necesitas.', 'On by default. Used to verify identity at the door. Turn it off if you do not need it.')}</p>
        </div>
        <div className="s-field">
          <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="is_free" defaultChecked={p.isFree} disabled={ro || p.hasSales} />
            <span>{t('Evento gratis (entrada libre con registro)', 'Free event (open entry with registration)')}</span>
          </label>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            {t('Por defecto desactivado. Actívalo solo si la entrada no se cobra: tus tipos en S/0 pasan a ofrecerse al público y la entrada se emite al instante, sin pago. Los tipos marcados como cortesía siguen sin aparecer — esos se siguen emitiendo desde tu panel.', 'Off by default. Turn it on only if entry is not charged: your S/0 types start being offered to the public and the ticket is issued instantly, with no payment. Types marked as complimentary still do not appear — those are still issued from your dashboard.')}
            {p.hasSales && ' ' + t('No se puede cambiar: este evento ya tiene ventas pagas, y marcarlo gratis diría "Gratis" en un evento que cobró.', 'This cannot be changed: this event already has paid sales, and marking it free would say "Free" on an event that charged.')}
          </p>
        </div>
        <div className="s-field">
          <label className="s-label" htmlFor="ev-maxpp">{t('Máximo de entradas por persona', 'Maximum tickets per person')}</label>
          <input id="ev-maxpp" name="max_per_person" type="number" min={0} max={100} placeholder={t('Sin límite', 'Unlimited')} defaultValue={p.maxPerPerson ?? ''} className="s-input" disabled={ro} />
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            {t('Vacío = sin límite. Si pones un número, cada persona puede llevarse como máximo esa cantidad en todo el evento: se cuenta por correo Y por documento, así que cambiar de correo con el mismo documento no da más entradas. Sirve sobre todo en eventos gratis, donde sin tope unos pocos se llevan el aforo.', 'Empty = no limit. If you set a number, each person can take at most that amount for the whole event: it is counted by email AND by document, so changing email with the same document does not give more tickets. Mostly useful in free events, where without a cap a few people take up the whole capacity.')}
          </p>
        </div>
        <div className="s-field">
          <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="send_reminder" defaultChecked={p.sendReminder} disabled={ro} />
            <span>{t('Enviar recordatorio por email ~24h antes del evento', 'Send an email reminder ~24h before the event')}</span>
          </label>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t('Por defecto desactivado. Si lo activas, cada comprador con entrada válida recibe un recordatorio automático el día previo (una sola vez).', 'Off by default. If you turn it on, every buyer with a valid ticket gets an automatic reminder the day before (only once).')}</p>
        </div>
        <div className="s-field">
          <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="collect_attendee_names" defaultChecked={p.collectAttendeeNames} disabled={ro} />
            <span>{t('Pedir el nombre de cada asistente en el checkout', 'Ask for each attendee\'s name at checkout')}</span>
          </label>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t('Por defecto desactivado. Si lo activas, el comprador puede poner un nombre por entrada (aparece en cada QR). Opcional para el comprador.', 'Off by default. If you turn it on, the buyer can set a name per ticket (it appears on each QR). Optional for the buyer.')}</p>
        </div>
        <div className="s-field">
          <label className="s-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="allow_transfer" defaultChecked={p.allowTransfer} disabled={ro} />
            <span>{t('Permitir transferir / regalar entradas', 'Allow transferring / gifting tickets')}</span>
          </label>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t('Por defecto desactivado. Si lo activas, cada comprador puede pasar su entrada a otra persona desde su QR (se reemite el QR y se avisa al nuevo dueño por email).', 'Off by default. If you turn it on, each buyer can pass their ticket to another person from their QR (the QR is reissued and the new owner is notified by email).')}</p>
        </div>
      </details>
      <Banner state={state} />
      {!ro && <div className="s-form-actions"><Submit label={t('Guardar datos del evento', 'Save event details')} /></div>}
    </form>
  );
}

// Precio S/0 en un tipo: ilimitado → bloqueado; con aforo → confirmación explícita
// (confirm_free=1). El server exige lo mismo y revalida; esto es solo UX.
// `previousPriceCents` = precio actual del tipo (no se reconfirma si ya era 0).
function guardFreePrice(e: React.FormEvent<HTMLFormElement>, t: Textos['t'], previousPriceCents?: number) {
  const form = e.currentTarget;
  const priceEl = form.elements.namedItem('price_soles') as HTMLInputElement | null;
  const hidden = form.elements.namedItem('confirm_free') as HTMLInputElement | null;
  if (hidden) hidden.value = '';
  if (!priceEl || priceEl.disabled || priceEl.value === '') return;
  if (Math.round(parseFloat(priceEl.value) * 100) !== 0) return;
  const unlimited = (form.elements.namedItem('is_unlimited') as HTMLInputElement | null)?.checked;
  if (unlimited) {
    e.preventDefault();
    window.alert(t('Un tipo no puede ser gratis e ilimitado a la vez. Pon un cupo o un precio.', 'A type cannot be free and unlimited at the same time. Set a capacity or a price.'));
    return;
  }
  if (previousPriceCents === 0) return;
  if (!window.confirm(t('Este tipo cuesta S/ 0. Los tipos gratis NO se venden en tu página: se emiten desde "Cortesías" y descuentan del aforo. ¿Confirmas?', 'This type costs S/ 0. Free types are NOT sold on your page: they are issued from "Complimentary tickets" and count against capacity. Confirm?'))) {
    e.preventDefault();
    return;
  }
  if (hidden) hidden.value = '1';
}

// Con la casilla "Gratis" marcada, esa casilla ES la confirmación del S/0
// (confirm_free=1): no hace falta el confirm(). Sin marcarla, un precio 0
// escrito a mano pasa por guardFreePrice como antes. El server revalida igual.
function guardPrice(e: React.FormEvent<HTMLFormElement>, t: Textos['t'], free: boolean, previousPriceCents?: number) {
  if (!free) return guardFreePrice(e, t, previousPriceCents);
  const form = e.currentTarget;
  const hidden = form.elements.namedItem('confirm_free') as HTMLInputElement | null;
  const priceEl = form.elements.namedItem('price_soles') as HTMLInputElement | null;
  if (hidden) hidden.value = '';
  if (!priceEl || priceEl.disabled) return;
  if ((form.elements.namedItem('is_unlimited') as HTMLInputElement | null)?.checked) {
    e.preventDefault();
    window.alert(t('Una entrada no puede ser gratis y sin límite a la vez. Pon una capacidad o un precio.', 'A ticket cannot be free and unlimited at the same time. Set a capacity or a price.'));
    return;
  }
  if (hidden) hidden.value = '1';
}

// Colores rápidos para el punto del tipo (decorativo: nunca lleva texto encima).
const SWATCHES = ['#FF1F8F', '#E8552A', '#F5B301', '#22A06B', '#2F6FEB', '#8B5CF6'];

function ColorField({ id, initial, disabled }: { id: string; initial: string | null; disabled?: boolean }) {
  const { t } = useTextos();
  const [color, setColor] = useState((initial ?? '').toUpperCase());
  return (
    <div className="s-field">
      <label className="s-label" htmlFor={id}>{t('Color', 'Color')}</label>
      <input type="hidden" name="color_hex" value={color} />
      <div className="a-tt-colors">
        <input id={id} type="color" className="s-colorpick" value={color || '#888888'} onChange={(e) => setColor(e.target.value.toUpperCase())} disabled={disabled} />
        {SWATCHES.map((c) => (
          <button key={c} type="button" className="a-tt-swatch" style={{ '--sw': c } as React.CSSProperties} aria-label={t(`Usar el color ${c}`, `Use color ${c}`)} aria-pressed={color === c} onClick={() => setColor(c)} disabled={disabled} />
        ))}
        {color && !disabled && <button type="button" className="s-btn s-btn--ghost s-btn--sm" onClick={() => setColor('')}>{t('Sin color', 'No color')}</button>}
      </div>
      <p className="s-hint">{t('Para reconocer esta entrada de un vistazo.', 'To recognize this ticket at a glance.')}</p>
    </div>
  );
}

function PriceField({ id, defaultSoles, free, onFree, locked, eventIsFree }: { id: string; defaultSoles?: string; free: boolean; onFree: (v: boolean) => void; locked?: boolean; eventIsFree: boolean }) {
  const { t } = useTextos();
  return (
    <div className="s-field">
      <label className="s-label" htmlFor={id}>{t('Precio (S/)', 'Price (S/)')}{locked && <span className="s-muted" style={{ fontWeight: 500 }}> · {t('congelado, hay ventas', 'frozen, there are sales')}</span>}</label>
      {free
        ? <input type="hidden" name="price_soles" value="0" disabled={locked} />
        : <input id={id} name="price_soles" type="number" step="0.5" min={0} defaultValue={defaultSoles} placeholder="50" className="s-input" required={!locked} disabled={locked} title={locked ? t('No editable: ya tiene ventas', 'Not editable: it already has sales') : undefined} />}
      <label className="s-check"><input type="checkbox" checked={free} onChange={(e) => onFree(e.target.checked)} disabled={locked} /> {t('Gratis', 'Free')}</label>
      {free && !eventIsFree && (
        <p className="s-hint">{t('En un evento con precio, una entrada gratis es de cortesía: no se vende al público; la repartes desde Cortesías o con un código.', 'In an event with a price, a free ticket is complimentary: it is not sold to the public; you hand it out from Complimentary tickets or with a code.')}</p>
      )}
    </div>
  );
}

// Una fila por tipo de entrada: plegada muestra lo que importa (color, nombre,
// precio, vendidas); abierta se edita y tiene SU botón de guardar.
export function TicketTypeEditor({ eventId, eventIsFree, tt, readOnly = false, linkPrivado = null, limitePrivado = null, eventName = '', isFirst = false, isLast = false }: { eventId: string; eventIsFree: boolean; tt: TtRow; readOnly?: boolean; linkPrivado?: string | null; limitePrivado?: number | null; eventName?: string; isFirst?: boolean; isLast?: boolean }) {
  const { t } = useTextos();
  const [state, action] = useFormFeedback(updateTicketTypeAction, initial);
  const [free, setFree] = useState(tt.priceCents === 0);
  const hasSales = tt.sold > 0;
  const ro = readOnly;
  const price = tt.isCourtesy ? t('Cortesía', 'Complimentary') : tt.priceCents === 0 ? t('Gratis', 'Free') : formatPEN(tt.priceCents);
  const stock = tt.isUnlimited ? t(`${tt.sold} vendidas · sin límite`, `${tt.sold} sold · unlimited`) : t(`${tt.sold} de ${tt.capacity} vendidas`, `${tt.sold} of ${tt.capacity} sold`);
  return (
    <details className="s-fold">
      <summary>
        <span className="a-tt-sum">
          <span className={tt.colorHex ? 'a-tt-dot a-tt-dot--on' : 'a-tt-dot'} style={tt.colorHex ? ({ '--sw': tt.colorHex } as React.CSSProperties) : undefined} aria-hidden="true" />
          <span className="a-tt-name">{tt.name}</span>
          <span className="a-tt-meta">{price} · {stock}{!tt.isActive && ` · ${t('pausada', 'paused')}`}{linkPrivado && ` · ${t('privada (solo con link)', 'private (link-only)')}${limitePrivado ? ` · ${t(`${limitePrivado} por persona`, `${limitePrivado} per person`)}` : ''}`}</span>
        </span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="s-fold__body">
        <form action={action} onSubmit={(e) => guardPrice(e, t, free, tt.priceCents)}>
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="ticket_type_id" value={tt.id} />
          <input type="hidden" name="confirm_free" defaultValue="" />
          <div className="s-form-grid">
            <div className="s-field"><label className="s-label" htmlFor={`tt-name-${tt.id}`}>{t('Nombre', 'Name')}</label>
              <input id={`tt-name-${tt.id}`} name="name" defaultValue={tt.name} className="s-input" disabled={ro} /></div>
            <PriceField id={`tt-price-${tt.id}`} defaultSoles={(tt.priceCents / 100).toFixed(2)} free={free} onFree={setFree} locked={hasSales || ro} eventIsFree={eventIsFree} />
          </div>
          <div className="s-form-grid">
            <div className="s-field">
              <label className="s-label" htmlFor={`tt-cap-${tt.id}`}>{t('Capacidad', 'Capacity')}{!tt.isUnlimited && tt.sold > 0 && !ro && <span className="s-muted" style={{ fontWeight: 500 }}> · {t(`mín. ${tt.sold} (vendidas)`, `min. ${tt.sold} (sold)`)}</span>}</label>
              <input id={`tt-cap-${tt.id}`} name="capacity" type="number" min={Math.max(1, tt.sold)} defaultValue={tt.capacity || ''} className="s-input" disabled={tt.isUnlimited || ro} />
              <label className="s-check"><input type="checkbox" name="is_unlimited" defaultChecked={tt.isUnlimited} disabled={ro} /> {t('Sin límite', 'Unlimited')}</label>
            </div>
            <ColorField id={`tt-color-${tt.id}`} initial={tt.colorHex} disabled={ro} />
          </div>
          <div className="s-field">
            <label className="s-check"><input type="checkbox" name="is_active" defaultChecked={tt.isActive} disabled={ro} /> {t('A la venta', 'On sale')}</label>
            <p className="s-hint">{t('Desmárcala para pausar esta entrada sin borrarla.', 'Uncheck it to pause this ticket type without deleting it.')}</p>
          </div>
          <details className="s-details">
            <summary>{t('Más opciones', 'More options')}</summary>
            <div className="s-field">
              <label className="s-label" htmlFor={`tt-desc-${tt.id}`}>{t('Descripción (opcional)', 'Description (optional)')}</label>
              <textarea id={`tt-desc-${tt.id}`} name="description" defaultValue={tt.description} className="s-input" rows={2} maxLength={280} placeholder={t('Barra libre toda la noche\nAcceso preferencial', 'Open bar all night\nPriority access')} style={{ resize: 'vertical' }} disabled={ro} />
              <p className="s-hint">{t('Se muestra debajo del nombre en el checkout. Una línea por beneficio. No afecta precio ni cantidad.', 'Shown below the name at checkout. One line per benefit. Does not affect price or quantity.')}</p>
            </div>
            <BulkFields minQty={tt.bulkMinQty} pct={tt.bulkDiscountPct} disabled={ro} />
          </details>
          <Banner state={state} />
          {!ro && <div className="s-form-actions"><Submit label={t(`Guardar cambios de ${tt.name}`, `Save changes to ${tt.name}`)} /></div>}
        </form>
        {!ro && !(isFirst && isLast) && <MoveTicketType eventId={eventId} ttId={tt.id} isFirst={isFirst} isLast={isLast} />}
        {!ro && <PrivateLink eventId={eventId} tt={tt} link={linkPrivado} limite={limitePrivado} eventName={eventName} />}
      </div>
    </details>
  );
}

// Orden en la página de compra: la entrada sube o baja un lugar.
function MoveTicketType({ eventId, ttId, isFirst, isLast }: { eventId: string; ttId: string; isFirst: boolean; isLast: boolean }) {
  const { t } = useTextos();
  const [state, action] = useFormFeedback(moveTicketTypeAction, initial);
  void state;
  return (
    <form action={action} className="s-form-actions">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="ticket_type_id" value={ttId} />
      <span className="s-hint">{t('Orden en tu página', 'Order on your page')}</span>
      <button type="submit" name="dir" value="up" className="s-btn s-btn--soft s-btn--sm" disabled={isFirst}><ChevronUp aria-hidden="true" /> {t('Subir', 'Move up')}</button>
      <button type="submit" name="dir" value="down" className="s-btn s-btn--soft s-btn--sm" disabled={isLast}><ChevronDown aria-hidden="true" /> {t('Bajar', 'Move down')}</button>
    </form>
  );
}

export function NewTicketTypeForm({ eventId, eventIsFree }: { eventId: string; eventIsFree: boolean }) {
  const { t } = useTextos();
  const [state, action] = useFormFeedback(createTicketTypeAction, initial);
  // Tras crear, el formulario se vacía (remonta con una key nueva).
  const [round, setRound] = useState(0);
  useEffect(() => { if (state.ok) setRound((r) => r + 1); }, [state]);
  return (
    <details className="s-fold">
      <summary>
        <span className="a-tt-sum">
          <Plus className="a-tt-plus" aria-hidden="true" />
          <span className="a-tt-name">{t('Agregar tipo de entrada', 'Add ticket type')}</span>
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
  const { t } = useTextos();
  const [free, setFree] = useState(false);
  const [privada, setPrivada] = useState(false);
  return (
    <form action={action} onSubmit={(e) => guardPrice(e, t, free)}>
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="confirm_free" defaultValue="" />
      <div className="s-form-grid">
        <div className="s-field"><label className="s-label" htmlFor="tt-new-name">{t('Nombre', 'Name')}</label>
          <input id="tt-new-name" name="name" placeholder="VIP" className="s-input" required /></div>
        <PriceField id="tt-new-price" free={free} onFree={setFree} eventIsFree={eventIsFree} />
      </div>
      <div className="s-form-grid">
        <div className="s-field">
          <label className="s-label" htmlFor="tt-new-cap">{t('Capacidad', 'Capacity')}</label>
          <input id="tt-new-cap" name="capacity" type="number" min={1} placeholder="100" className="s-input" />
          <label className="s-check"><input type="checkbox" name="is_unlimited" /> {t('Sin límite', 'Unlimited')}</label>
        </div>
        <ColorField id="tt-new-color" initial={null} />
      </div>
      <div className="s-field">
        <label className="s-check"><input type="checkbox" name="privada" checked={privada} onChange={(e) => setPrivada(e.target.checked)} /> {t('Privada: solo con link', 'Private: link-only')}</label>
        <p className="s-hint">{t('No aparece en tu página. Te damos un link para mandarle a un promotor: solo quien entra con ese link la ve y la reclama.', 'It does not appear on your page. We give you a link to send a promoter: only whoever opens that link sees it and claims it.')}</p>
      </div>
      {privada && (
        <div className="s-field">
          <label className="s-label" htmlFor="tt-new-max">{t('Cuántas puede reclamar cada persona', 'How many each person can claim')}</label>
          <input key={String(free)} id="tt-new-max" name="max_por_persona" type="number" inputMode="numeric" min={1} max={100} defaultValue={free ? '1' : ''} placeholder={t('Sin límite', 'Unlimited')} className="s-input" />
          <p className="s-hint">{t('Se cuenta por correo y por documento. Déjalo vacío para no limitar.', 'It is counted by email and by document. Leave it empty to not limit it.')}</p>
        </div>
      )}
      <details className="s-details">
        <summary>{t('Más opciones', 'More options')}</summary>
        <div className="s-field">
          <label className="s-label" htmlFor="tt-new-desc">{t('Descripción (opcional)', 'Description (optional)')}</label>
          <textarea id="tt-new-desc" name="description" className="s-input" rows={2} maxLength={280} placeholder={t('Barra libre toda la noche\nAcceso preferencial', 'Open bar all night\nPriority access')} style={{ resize: 'vertical' }} />
          <p className="s-hint">{t('Se muestra debajo del nombre en el checkout. Una línea por beneficio.', 'Shown below the name at checkout. One line per benefit.')}</p>
        </div>
        <BulkFields />
      </details>
      <div className="s-form-actions"><Submit label={t('Agregar tipo de entrada', 'Add ticket type')} /></div>
    </form>
  );
}

// ENTRADA PRIVADA CON LINK (0066). Formulario aparte del de "Guardar cambios":
// hacerla privada, copiar/compartir su link, cambiarlo (el viejo deja de
// servir) o volverla pública. El token lo genera el server.
function PrivateLink({ eventId, tt, link, limite, eventName }: { eventId: string; tt: TtRow; link: string | null; limite: number | null; eventName: string }) {
  const { t } = useTextos();
  const [state, action] = useFormFeedback(setTicketTypePrivateAction, initial);
  const [stateLim, actionLim] = useFormFeedback(setTicketTypePrivateAction, initial);
  void state; void stateLim;
  async function copiar() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); toast.success(t('Link copiado. Mándaselo a tu promotor.', 'Link copied. Send it to your promoter.')); }
    catch { toast.error(t('No se pudo copiar. Mantén apretado el link.', 'Could not copy. Press and hold the link.')); }
  }
  const wa = link ? `https://wa.me/?text=${encodeURIComponent(`Reclama tu entrada "${tt.name}"${eventName ? ` para ${eventName}` : ''}: ${link}`)}` : '';
  return (
    <div className="a-priv">
      <div className="a-priv__head">
        <Lock aria-hidden="true" />
        <div>
          <strong>{link ? t('Privada: solo con link', 'Private: link-only') : t('Link privado', 'Private link')}</strong>
          <p className="s-hint" style={{ marginTop: 2 }}>
            {link
              ? t('No aparece en tu página. Solo quien entra con este link la ve y la reclama.', 'It does not appear on your page. Only whoever opens this link sees it and claims it.')
              : t('Hazla privada para mandarle un link a un promotor: no aparece en tu página.', 'Make it private to send a link to a promoter: it does not appear on your page.')}
          </p>
        </div>
      </div>
      <form action={action} className="a-priv__acts">
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="ticket_type_id" value={tt.id} />
        {link ? (
          <>
            <button type="button" className="s-btn s-btn--soft s-btn--sm" onClick={copiar}><Link2 aria-hidden="true" /> {t('Copiar link', 'Copy link')}</button>
            <a className="s-btn s-btn--soft s-btn--sm" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" /> WhatsApp</a>
            <button type="submit" name="accion" value="cambiar" className="s-btn s-btn--ghost s-btn--sm"
              onClick={(e) => { if (!confirm(t('¿Cambiar el link? El link anterior deja de servir.', 'Change the link? The old link will stop working.'))) e.preventDefault(); }}>
              <RefreshCw aria-hidden="true" /> {t('Cambiar link', 'Change link')}
            </button>
            <button type="submit" name="accion" value="publica" className="s-btn s-btn--ghost s-btn--sm"
              onClick={(e) => { if (!confirm(t(`¿Hacer pública "${tt.name}"? Va a aparecer en tu página para todos.`, `Make "${tt.name}" public? It will appear on your page for everyone.`))) e.preventDefault(); }}>
              {t('Hacerla pública', 'Make it public')}
            </button>
          </>
        ) : (
          <button type="submit" name="accion" value="privada" className="s-btn s-btn--soft s-btn--sm"><Lock aria-hidden="true" /> {t('Hacerla privada', 'Make it private')}</button>
        )}
      </form>
      {link && (
        // Cuántas por persona (0068): formulario aparte para que Enter en el
        // número no dispare "Cambiar link".
        <form action={actionLim} className="s-field a-priv__lim">
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="ticket_type_id" value={tt.id} />
          <input type="hidden" name="accion" value="limite" />
          <label className="s-label" htmlFor={`max-${tt.id}`}>{t('Cuántas puede reclamar cada persona', 'How many each person can claim')}</label>
          <div className="a-priv__acts">
            <input id={`max-${tt.id}`} name="max_por_persona" type="number" inputMode="numeric" min={1} max={100} defaultValue={limite ?? ''} placeholder={t('Sin límite', 'Unlimited')} className="s-input a-priv__num" />
            <button type="submit" className="s-btn s-btn--soft s-btn--sm">{t('Guardar límite', 'Save limit')}</button>
          </div>
          <p className="s-hint">{t('Se cuenta por correo y por documento. Vacío = sin límite.', 'It is counted by email and by document. Empty = no limit.')}</p>
        </form>
      )}
    </div>
  );
}
