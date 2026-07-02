'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { createBrandEventAction, type FormState } from './actions';

const initial: FormState = { ok: false, message: null, fieldErrors: {} };

type Phase = { priceSoles: string; until: string };
type TT = { name: string; description: string; unlimited: boolean; capacity: string; phases: Phase[] };

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const toISO = (local: string): string | null => (local ? new Date(local).toISOString() : null);
const toCents = (s: string): number => Math.round(parseFloat(s || '0') * 100) || 0;
const newTT = (): TT => ({ name: '', description: '', unlimited: false, capacity: '100', phases: [{ priceSoles: '', until: '' }] });

export function EventBuilder() {
  const [state, action] = useFormState(createBrandEventAction, initial);
  const [tts, setTts] = useState<TT[]>([newTT()]);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverName, setCoverName] = useState<string | null>(null);
  const min = nowLocalInput();

  function onCover(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setCoverPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null; });
    setCoverName(f?.name ?? null);
  }
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  const serialized = useMemo(
    () =>
      tts.map((tt, i) => {
        const phases = tt.phases.map((ph, j) => ({
          price_cents: toCents(ph.priceSoles),
          starts_at: j === 0 ? null : toISO(tt.phases[j - 1]?.until ?? ''),
          ends_at: toISO(ph.until),
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
    <form action={action} className="s-stack" style={{ gap: 16 }}>
      <input type="hidden" name="ticket_types_json" value={JSON.stringify(serialized)} />

      {/* Evento */}
      <section className="s-card">
        <p className="s-section-lead" style={{ marginBottom: 14 }}>Evento</p>
        <FieldRow id="name" label="Nombre" required error={state.fieldErrors?.name}>
          <input id="name" name="name" placeholder="Density · Noche 04" required className="s-input" />
        </FieldRow>
        <div className="s-field">
          <FieldRow id="slug" label="Slug" hint="Ej: density-04 → tumarca.parygo.com/density-04" required error={state.fieldErrors?.slug}>
            <input id="slug" name="slug" placeholder="density-04" pattern="^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$" required className="s-input" />
          </FieldRow>
        </div>
        <div className="s-field">
          <FieldRow id="description" label="Descripción corta">
            <textarea id="description" name="description" rows={2} className="s-input" placeholder="DJ Headliner · Club Foso · Lima" />
          </FieldRow>
        </div>
        <div className="s-field">
          <FieldRow id="cover" label="Flyer del evento (opcional)" hint="PNG, JPG o WEBP · vertical o cuadrado · máx 10 MB. Se ve grande en la portada y en tu página de marca." error={state.fieldErrors?.cover}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {coverPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="" style={{ width: 90, height: 120, objectFit: 'cover', borderRadius: 'var(--r-ctl)', border: '1px solid var(--cream-3)', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 180 }}>
                <input id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp" onChange={onCover} className="s-input" style={{ paddingTop: 9 }} />
                {coverName && <p className="s-hint">{coverName}</p>}
              </div>
            </div>
          </FieldRow>
        </div>
        <div className="s-form-grid s-field">
          <FieldRow id="starts_at" label="Inicio" required error={state.fieldErrors?.starts_at}>
            <input id="starts_at" name="starts_at" type="datetime-local" min={min} required className="s-input" />
          </FieldRow>
          <FieldRow id="ends_at" label="Fin estimado">
            <input id="ends_at" name="ends_at" type="datetime-local" min={min} className="s-input" />
          </FieldRow>
        </div>
        <div className="s-form-grid s-field">
          <FieldRow id="venue_name" label="Local">
            <input id="venue_name" name="venue_name" placeholder="Club Foso" className="s-input" />
          </FieldRow>
          <FieldRow id="venue_address" label="Dirección">
            <input id="venue_address" name="venue_address" placeholder="Av. Foso 123, Miraflores" className="s-input" />
          </FieldRow>
        </div>
        <div className="s-field">
          <FieldRow id="min_age" label="Edad mínima">
            <input id="min_age" name="min_age" type="number" min={0} max={99} defaultValue={18} className="s-input" style={{ maxWidth: 120 }} />
          </FieldRow>
        </div>
        <div className="s-field">
          <FieldRow id="refund_policy" label="Política de devolución">
            <textarea id="refund_policy" name="refund_policy" rows={2} className="s-input" defaultValue="Sin devolución post-pago salvo cancelación del evento." />
          </FieldRow>
        </div>
      </section>

      {/* Tipos de entrada */}
      <section className="s-card">
        <div className="s-card__head">
          <p className="s-section-lead" style={{ margin: 0 }}>Tipos de entrada</p>
          <button type="button" className="s-btn s-btn--soft s-btn--sm" onClick={() => setTts((s) => [...s, newTT()])}>
            <Plus className="h-4 w-4" /> Tipo
          </button>
        </div>

        <div className="s-stack" style={{ gap: 14, marginTop: 14 }}>
          {tts.map((tt, i) => (
            <div key={i} className="s-card" style={{ background: 'var(--cream)', boxShadow: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="s-label">Nombre del tipo</label>
                  <input value={tt.name} onChange={(e) => patchTT(i, { name: e.target.value })} placeholder="General / VIP" required className="s-input" />
                </div>
                {tts.length > 1 && (
                  <button type="button" className="s-btn s-btn--ghost s-btn--sm" onClick={() => setTts((s) => s.filter((_, k) => k !== i))} aria-label="Quitar tipo">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div style={{ marginTop: 12 }}>
                <label className="s-label">Descripción (opcional)</label>
                <textarea value={tt.description} onChange={(e) => patchTT(i, { description: e.target.value })} rows={2} maxLength={280} placeholder={'Barra libre toda la noche\nAcceso preferencial'} className="s-input" style={{ resize: 'vertical' }} />
                <p className="s-hint">Se muestra debajo del nombre en el checkout. Una línea por beneficio.</p>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginTop: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  <input type="checkbox" checked={tt.unlimited} onChange={(e) => patchTT(i, { unlimited: e.target.checked })} />
                  Stock ilimitado
                </label>
                {!tt.unlimited && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label className="s-label" style={{ margin: 0 }}>Cupo</label>
                    <input type="number" min={0} value={tt.capacity} onChange={(e) => patchTT(i, { capacity: e.target.value })} className="s-input" style={{ width: 110 }} />
                  </div>
                )}
              </div>

              {/* Fases de precio */}
              <div style={{ marginTop: 14 }}>
                <div className="s-card__head" style={{ marginBottom: 8 }}>
                  <span className="eyebrow">Fases de precio</span>
                  <button type="button" className="s-btn s-btn--ghost s-btn--sm" onClick={() => patchTT(i, { phases: [...tt.phases, { priceSoles: '', until: '' }] })}>
                    <Plus className="h-3 w-3" /> Fase
                  </button>
                </div>
                <div className="s-stack" style={{ gap: 8 }}>
                  {tt.phases.map((ph, j) => (
                    <div key={j} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end', padding: 12, border: '1px solid var(--cream-3)', borderRadius: 'var(--r-ctl)', background: 'var(--white)' }}>
                      <div>
                        <label className="s-label" style={{ fontSize: 11 }}>Precio (S/)</label>
                        <input type="number" step="0.5" min={0} value={ph.priceSoles} onChange={(e) => patchPhase(i, j, { priceSoles: e.target.value })} placeholder="30" required className="s-input" />
                      </div>
                      <div>
                        <label className="s-label" style={{ fontSize: 11 }}>{j === tt.phases.length - 1 ? 'Hasta (vacío = hasta el evento)' : 'Sube el'}</label>
                        <input type="datetime-local" min={min} value={ph.until} onChange={(e) => patchPhase(i, j, { until: e.target.value })} className="s-input" />
                      </div>
                      {tt.phases.length > 1 && (
                        <button type="button" className="s-btn s-btn--ghost s-btn--sm" onClick={() => patchTT(i, { phases: tt.phases.filter((_, m) => m !== j) })} aria-label="Quitar fase">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {tt.phases.length > 1 && (
                    <p className="s-hint">Cada fase arranca cuando termina la anterior. La última sin fecha vale hasta el evento.</p>
                  )}
                </div>
              </div>
            </div>
          ))}
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
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--primary s-btn--lg" disabled={pending}>
      {pending ? 'Creando…' : 'Crear evento'}
    </button>
  );
}
