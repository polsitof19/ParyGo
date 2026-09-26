'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { pareceCaptura, medirImagen } from '@/lib/flyer';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { useTextos } from '@/components/IdiomaPanel';
import { createBrandEventAction, type FormState } from './actions';

const initial: FormState = { ok: false, message: null, fieldErrors: {} };

type Phase = { priceSoles: string; until: string };
type TT = { name: string; description: string; unlimited: boolean; capacity: string; phases: Phase[] };

// "Ahora" en hora de Lima (UTC-5 fijo) para el min de los datetime-local, igual
// que el server (no la zona horaria de la compu del promotor).
function nowLocalInput(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 16);
}
// datetime-local → ISO en hora de Lima (UTC-5 fijo), igual que el server con
// starts_at/ends_at. No depende de la zona horaria de la compu del promotor.
const toISO = (local: string): string | null => {
  if (!local) return null;
  const d = new Date(`${local.length === 16 ? `${local}:00` : local}-05:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const toCents = (s: string): number => Math.round(parseFloat(s || '0') * 100) || 0;

// Una fase de preventa termina AL FINAL del día que el promotor elige, no a la
// medianoche del día anterior ni a la hora que quedó en el input. Si pone
// "sube el 24 de setiembre" quiere decir que el 24 todavía se vende al precio
// viejo. El input es datetime-local, así que sin esto la hora arranca en 00:00
// y la preventa se corta un día antes de lo que el promotor cree.
// Todo en hora de Lima, que es la única que existe en este producto.
const FIN_DEL_DIA = '23:59';
const alFinDelDia = (local: string): string => {
  if (!local) return local;
  const [fecha, hora] = local.split('T');
  if (!fecha) return local;
  // Solo se completa lo que está en 00:00 (o vacío): si el promotor puso una
  // hora a propósito, se respeta.
  if (!hora || hora === '00:00' || hora === '00:00:00') return `${fecha}T${FIN_DEL_DIA}`;
  return local;
};
// El link del evento sale del nombre ("Density · Noche 04" → density-noche-04)
// mientras el organizador no lo toque; si lo edita a mano, se respeta.
const aSlug = (n: string): string => n
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  .slice(0, 42).replace(/-+$/g, '');
const newTT = (): TT => ({ name: '', description: '', unlimited: false, capacity: '100', phases: [{ priceSoles: '', until: '' }] });

export function EventBuilder() {
  const { t, l } = useTextos();
  const [state, action] = useFormState(createBrandEventAction, initial);
  const [tts, setTts] = useState<TT[]>([newTT()]);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverName, setCoverName] = useState<string | null>(null);
  const [avisoFlyer, setAvisoFlyer] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const slugManual = useRef(false);
  const min = nowLocalInput();
  const confirmFreeRef = useRef<HTMLInputElement>(null);

  // Tipos S/0: ilimitado → bloqueado; con aforo → confirmación explícita (el
  // server exige confirm_free=1 y vuelve a validar todo).
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const free = tts.filter((tt) => tt.phases.some((ph) => toCents(ph.priceSoles) === 0));
    const freeUnlimited = free.find((tt) => tt.unlimited);
    if (freeUnlimited) {
      e.preventDefault();
      window.alert(t(
        `"${freeUnlimited.name || 'Un tipo'}" no puede ser gratis e ilimitado a la vez. Pon un cupo o un precio.`,
        `"${freeUnlimited.name || 'A ticket type'}" can't be free and unlimited at the same time. Set a capacity or a price.`
      ));
      return;
    }
    if (confirmFreeRef.current) confirmFreeRef.current.value = '';
    if (free.length) {
      const names = free.map((tt) => `"${tt.name || t('sin nombre', 'unnamed')}"`).join(', ');
      const ok = window.confirm(t(
        `${names} cuesta S/ 0. Los tipos gratis NO se venden en tu página: se emiten desde "Cortesías" y descuentan del aforo. ¿Confirmas?`,
        `${names} costs S/ 0. Free ticket types are NOT sold on your page: they are issued from "Complimentary tickets" and count against capacity. Confirm?`
      ));
      if (!ok) { e.preventDefault(); return; }
      if (confirmFreeRef.current) confirmFreeRef.current.value = '1';
    }
  }

  async function onCover(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setCoverPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null; });
    setCoverName(f?.name ?? null);
    // Aviso de captura de pantalla. NO bloquea: solo lo dice.
    setAvisoFlyer(null);
    if (f) {
      const { width, height } = await medirImagen(f);
      const v = pareceCaptura(width, height, l);
      if (v.esCaptura) setAvisoFlyer(v.motivo);
    }
  }
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  const serialized = useMemo(
    () =>
      tts.map((tt, i) => {
        // El 23:59 también se aplica acá y no solo en el onBlur: si el
        // promotor escribe la fecha y manda el formulario sin salir del campo,
        // el onBlur no llega a correr y la preventa se cortaría a las 00:00.
        const phases = tt.phases.map((ph, j) => ({
          price_cents: toCents(ph.priceSoles),
          starts_at: j === 0 ? null : toISO(alFinDelDia(tt.phases[j - 1]?.until ?? '')),
          ends_at: toISO(alFinDelDia(ph.until)),
          sort_order: j + 1,
        }));
        return {
          name: tt.name,
          description: tt.description.trim().slice(0, 280),
          price_cents: phases[0]?.price_cents ?? 0,
          capacity: tt.unlimited ? 0 : parseInt(tt.capacity || '0', 10) || 0,
          is_unlimited: tt.unlimited,
          sort_order: i,
          phases,
        };
      }),
    [tts]
  );

  const patchTT = (i: number, p: Partial<TT>) => setTts((s) => s.map((t, k) => (k === i ? { ...t, ...p } : t)));
  const patchPhase = (i: number, j: number, p: Partial<Phase>) =>
    setTts((s) => s.map((t, k) => (k === i ? { ...t, phases: t.phases.map((ph, m) => (m === j ? { ...ph, ...p } : ph)) } : t)));

  return (
    <form action={action} onSubmit={onSubmit} className="s-stack" style={{ gap: 16 }}>
      <input type="hidden" name="ticket_types_json" value={JSON.stringify(serialized)} />
      <input type="hidden" name="confirm_free" ref={confirmFreeRef} defaultValue="" />

      {/* 1 · Lo básico: qué, cuándo y dónde. Es lo que el organizador tiene
          en la cabeza; el resto es opcional y va al final. */}
      <section className="s-card">
        <p className="s-section-lead a-step"><span className="a-step__n">1</span> {t('Lo básico', 'The basics')}</p>
        <FieldRow id="name" label={t('Nombre del evento', 'Event name')} required error={state.fieldErrors?.name}>
          <input
            id="name" name="name" placeholder="Density · Noche 04" required className="s-input"
            onChange={(e) => { if (!slugManual.current) setSlug(aSlug(e.target.value)); }}
          />
        </FieldRow>
        <div className="s-field">
          <FieldRow id="slug" label={t('Link del evento', 'Event link')} hint={slug ? `tumarca.parygo.com/${slug}` : t('Se arma solo con el nombre. Puedes cambiarlo.', 'It builds itself from the name. You can change it.')} required error={state.fieldErrors?.slug}>
            <input
              id="slug" name="slug" placeholder="density-04" pattern="^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$" required className="s-input"
              value={slug}
              onChange={(e) => { slugManual.current = true; setSlug(e.target.value.toLowerCase()); }}
            />
          </FieldRow>
        </div>
        <div className="s-form-grid s-field">
          <FieldRow id="starts_at" label={t('Empieza', 'Starts')} required error={state.fieldErrors?.starts_at}>
            <input id="starts_at" name="starts_at" type="datetime-local" min={min} required className="s-input" />
          </FieldRow>
          <FieldRow id="ends_at" label={t('Termina (aprox.)', 'Ends (approx.)')}>
            <input id="ends_at" name="ends_at" type="datetime-local" min={min} className="s-input" />
          </FieldRow>
        </div>
        <div className="s-form-grid s-field">
          <FieldRow id="venue_name" label={t('Local', 'Venue')}>
            <input id="venue_name" name="venue_name" placeholder="Club Foso" className="s-input" />
          </FieldRow>
          <FieldRow id="venue_address" label={t('Dirección', 'Address')}>
            <input id="venue_address" name="venue_address" placeholder="Av. Foso 123, Miraflores" className="s-input" />
          </FieldRow>
        </div>
        <div className="s-field">
          <label className="s-check">
            <input type="checkbox" name="is_free" />
            {t('Evento gratis (entrada libre con registro)', 'Free event (open entry with registration)')}
          </label>
          <p className="s-hint">
            {t(
              'Actívalo solo si la entrada no se cobra: tus tipos en S/0 se ofrecen al público y la entrada se emite al instante, sin pago. Lo puedes cambiar después, mientras no haya ventas.',
              "Turn it on only if entry is not charged: your S/0 ticket types are offered to the public and the ticket is issued instantly, without payment. You can change this later, as long as there are no sales."
            )}
          </p>
        </div>
      </section>

      {/* 2 · Entradas: cada tipo con su cupo y su precio (y sus preventas). */}
      <section className="s-card">
        <div className="s-card__head">
          <p className="s-section-lead a-step" style={{ margin: 0 }}><span className="a-step__n">2</span> {t('Entradas y precios', 'Tickets and prices')}</p>
          <button type="button" className="s-btn s-btn--soft s-btn--sm" onClick={() => setTts((s) => [...s, newTT()])}>
            <Plus className="h-4 w-4" /> {t('Tipo', 'Type')}
          </button>
        </div>

        <div className="s-stack" style={{ gap: 14, marginTop: 14 }}>
          {tts.map((tt, i) => (
            <div key={i} className="s-card" style={{ background: 'var(--paper)', boxShadow: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="s-label">{t('Nombre de la entrada', 'Ticket name')}</label>
                  <input value={tt.name} onChange={(e) => patchTT(i, { name: e.target.value })} placeholder="General / VIP" required className="s-input" />
                </div>
                {tts.length > 1 && (
                  <button type="button" className="s-btn s-btn--ghost s-btn--sm" onClick={() => setTts((s) => s.filter((_, k) => k !== i))} aria-label={t('Quitar tipo', 'Remove type')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div style={{ marginTop: 12 }}>
                <label className="s-label">{t('Descripción (opcional)', 'Description (optional)')}</label>
                <textarea value={tt.description} onChange={(e) => patchTT(i, { description: e.target.value })} rows={2} maxLength={280} placeholder={t('Barra libre toda la noche\nAcceso preferencial', 'Open bar all night\nPriority access')} className="s-input" style={{ resize: 'vertical' }} />
                <p className="s-hint">{t('Se muestra debajo del nombre en el checkout. Una línea por beneficio.', 'Shown below the name at checkout. One line per benefit.')}</p>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginTop: 12 }}>
                <label className="s-check">
                  <input type="checkbox" checked={tt.unlimited} onChange={(e) => patchTT(i, { unlimited: e.target.checked })} />
                  {t('Stock ilimitado', 'Unlimited stock')}
                </label>
                {!tt.unlimited && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label className="s-label" style={{ margin: 0 }}>{t('Cupo', 'Capacity')}</label>
                    <input type="number" min={0} value={tt.capacity} onChange={(e) => patchTT(i, { capacity: e.target.value })} className="s-input" style={{ width: 110 }} />
                  </div>
                )}
              </div>

              {/* Fases de precio */}
              <div style={{ marginTop: 14 }}>
                <div className="s-card__head" style={{ marginBottom: 8 }}>
                  <span className="eyebrow">{t('Fases de precio', 'Price phases')}</span>
                  <button type="button" className="s-btn s-btn--ghost s-btn--sm" onClick={() => patchTT(i, { phases: [...tt.phases, { priceSoles: '', until: '' }] })}>
                    <Plus className="h-3 w-3" /> {t('Fase', 'Phase')}
                  </button>
                </div>
                <div className="s-stack" style={{ gap: 8 }}>
                  {tt.phases.map((ph, j) => (
                    <div key={j} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end', padding: 12, border: '1px solid var(--line)', borderRadius: 'var(--r-ctl)', background: 'var(--surface)' }}>
                      <div>
                        <label className="s-label" style={{ fontSize: 11 }}>{t('Precio (S/)', 'Price (S/)')}</label>
                        <input type="number" step="0.5" min={0} value={ph.priceSoles} onChange={(e) => patchPhase(i, j, { priceSoles: e.target.value })} placeholder="30" required className="s-input" />
                      </div>
                      <div>
                        <label className="s-label" style={{ fontSize: 11 }}>{j === tt.phases.length - 1 ? t('Hasta (vacío = hasta el evento)', 'Until (empty = until the event)') : t('Sube el', 'Increases on')}</label>
                        <input
                          type="datetime-local"
                          min={min}
                          value={ph.until}
                          onChange={(e) => patchPhase(i, j, { until: e.target.value })}
                          // Al salir del campo se completa la hora a 23:59 si
                          // quedó en 00:00. Se sugiere, no se impone: queda
                          // escrito en el input y el promotor puede cambiarlo.
                          onBlur={(e) => patchPhase(i, j, { until: alFinDelDia(e.target.value) })}
                          className="s-input"
                        />
                        <p className="s-hint" style={{ fontSize: 11 }}>{t('Termina a las 23:59 de ese día.', 'Ends at 11:59 PM that day.')}</p>
                      </div>
                      {tt.phases.length > 1 && (
                        <button type="button" className="s-btn s-btn--ghost s-btn--sm" onClick={() => patchTT(i, { phases: tt.phases.filter((_, m) => m !== j) })} aria-label={t('Quitar fase', 'Remove phase')}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {tt.phases.length > 1 && (
                    <p className="s-hint">{t('Cada fase arranca cuando termina la anterior. La última sin fecha vale hasta el evento.', 'Each phase starts when the previous one ends. The last one without a date is valid until the event.')}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3 · Detalles opcionales: se pueden completar después, desde el evento. */}
      <section className="s-card">
        <p className="s-section-lead a-step"><span className="a-step__n">3</span> {t('Detalles', 'Details')} <span className="s-muted" style={{ fontWeight: 400 }}>{t('(opcional, lo puedes cambiar después)', '(optional, you can change it later)')}</span></p>
        <FieldRow id="description" label={t('Descripción corta', 'Short description')}>
          <textarea id="description" name="description" rows={2} className="s-input" placeholder="DJ Headliner · Club Foso · Lima" />
        </FieldRow>
        <div className="s-field">
          <FieldRow id="cover" label={t('Flyer del evento (opcional)', 'Event flyer (optional)')} hint={t('PNG, JPG o WEBP · vertical o cuadrado · máx 10 MB. Se ve grande en la portada y en tu página de marca.', 'PNG, JPG or WEBP · vertical or square · max 10 MB. It appears large on the cover and on your brand page.')} error={state.fieldErrors?.cover}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {coverPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="" style={{ width: 90, height: 120, objectFit: 'cover', borderRadius: 'var(--r-ctl)', border: '1px solid var(--line)', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 180 }}>
                <div className="s-file">
                  <input id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp" onChange={onCover} className="s-file__input" />
                  <label htmlFor="cover" className="s-btn s-btn--soft s-btn--sm s-file__btn">
                    {coverName ? t('Cambiar flyer', 'Change flyer') : t('Elegir flyer', 'Choose flyer')}
                  </label>
                  <span className="s-file__name">{coverName ?? t('Ninguno elegido', 'None chosen')}</span>
                </div>
                <p className="s-hint">
                  {t('Sube el ', 'Upload the ')}<strong>{t('archivo original', 'original file')}</strong>{t(' del flyer, no una captura de pantalla: la captura trae la barra del teléfono y sale borrosa en grande.', ' of the flyer, not a screenshot: a screenshot includes the phone status bar and looks blurry when enlarged.')}
                </p>
                {avisoFlyer && (
                  <p className="s-err" style={{ marginTop: 8 }}>
                    {t('Esto parece una captura de pantalla. ', 'This looks like a screenshot. ')}{avisoFlyer} {t('Puedes publicarlo igual, pero si tienes el archivo original va a verse mucho mejor.', 'You can publish it anyway, but if you have the original file it will look much better.')}
                  </p>
                )}
              </div>
            </div>
          </FieldRow>
        </div>
        <div className="s-field">
          <FieldRow id="min_age" label={t('Edad mínima', 'Minimum age')}>
            <input id="min_age" name="min_age" type="number" min={0} max={99} defaultValue={18} className="s-input" style={{ maxWidth: 120 }} />
          </FieldRow>
        </div>
        <div className="s-field">
          <FieldRow id="refund_policy" label={t('Política de devolución', 'Refund policy')}>
            <textarea id="refund_policy" name="refund_policy" rows={2} className="s-input" defaultValue="Sin devolución post-pago salvo cancelación del evento." />
          </FieldRow>
        </div>
      </section>

      {state.message && !state.ok && <p className="s-banner s-banner--err">{state.message}</p>}
      <div className="s-form-actions">
        <SubmitButton />
      </div>
    </form>
  );
}

function FieldRow({ id, label, hint, required, error, children }: { id: string; label: string; hint?: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="s-label">
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
      {hint && <p className="s-hint">{hint}</p>}
      {error && <p className="s-err">{error}</p>}
    </div>
  );
}

function SubmitButton() {
  const { t } = useTextos();
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--primary s-btn--lg" disabled={pending}>
      {pending ? t('Creando…', 'Creating…') : t('Crear evento', 'Create event')}
    </button>
  );
}
