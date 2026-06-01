'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createBrandEventAction, type FormState } from './actions';

const initial: FormState = { ok: false, message: null, fieldErrors: {} };

type Phase = { priceSoles: string; until: string };
type TT = { name: string; unlimited: boolean; capacity: string; phases: Phase[] };

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const toISO = (local: string): string | null => (local ? new Date(local).toISOString() : null);
const toCents = (s: string): number => Math.round(parseFloat(s || '0') * 100) || 0;
const newTT = (): TT => ({ name: '', unlimited: false, capacity: '100', phases: [{ priceSoles: '', until: '' }] });

export function EventBuilder() {
  const [state, action] = useFormState(createBrandEventAction, initial);
  const [tts, setTts] = useState<TT[]>([newTT()]);
  const min = nowLocalInput();

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
    <form action={action} className="space-y-6">
      <input type="hidden" name="ticket_types_json" value={JSON.stringify(serialized)} />

      {/* EVENT */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">[ EVENTO ]</h2>
        <FieldRow id="name" label="Nombre" required error={state.fieldErrors?.name}>
          <Input id="name" name="name" placeholder="Density · Noche 04" required />
        </FieldRow>
        <FieldRow id="slug" label="Slug" hint="Ej: density-04 → tumarca.parygo.com/density-04" required error={state.fieldErrors?.slug}>
          <Input id="slug" name="slug" placeholder="density-04" pattern="^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$" required />
        </FieldRow>
        <FieldRow id="description" label="Descripción corta">
          <textarea id="description" name="description" rows={2} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="DJ Headliner · Club Foso · Lima" />
        </FieldRow>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow id="starts_at" label="Inicio" required error={state.fieldErrors?.starts_at}>
            <Input id="starts_at" name="starts_at" type="datetime-local" min={min} required />
          </FieldRow>
          <FieldRow id="ends_at" label="Fin estimado">
            <Input id="ends_at" name="ends_at" type="datetime-local" min={min} />
          </FieldRow>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow id="venue_name" label="Local">
            <Input id="venue_name" name="venue_name" placeholder="Club Foso" />
          </FieldRow>
          <FieldRow id="venue_address" label="Dirección">
            <Input id="venue_address" name="venue_address" placeholder="Av. Foso 123, Miraflores" />
          </FieldRow>
        </div>
        <FieldRow id="min_age" label="Edad mínima">
          <Input id="min_age" name="min_age" type="number" min={0} max={99} defaultValue={18} className="max-w-[120px]" />
        </FieldRow>
        <FieldRow id="refund_policy" label="Política de devolución">
          <textarea id="refund_policy" name="refund_policy" rows={2} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue="Sin devolución post-pago salvo cancelación del evento." />
        </FieldRow>
      </section>

      {/* TICKET TYPES */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">[ TIPOS DE ENTRADA ]</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setTts((s) => [...s, newTT()])}>
            <Plus className="h-4 w-4" /> Tipo
          </Button>
        </div>

        {tts.map((tt, i) => (
          <div key={i} className="space-y-4 rounded-md border border-border p-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-2">
                <Label>Nombre del tipo</Label>
                <Input value={tt.name} onChange={(e) => patchTT(i, { name: e.target.value })} placeholder="General / VIP" required />
              </div>
              {tts.length > 1 && (
                <Button type="button" variant="ghost" size="icon" onClick={() => setTts((s) => s.filter((_, k) => k !== i))} aria-label="Quitar tipo">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={tt.unlimited} onChange={(e) => patchTT(i, { unlimited: e.target.checked })} />
                Stock ilimitado
              </label>
              {!tt.unlimited && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Cupo</Label>
                  <Input type="number" min={0} value={tt.capacity} onChange={(e) => patchTT(i, { capacity: e.target.value })} className="w-28" />
                </div>
              )}
            </div>

            {/* Phases */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Fases de precio</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => patchTT(i, { phases: [...tt.phases, { priceSoles: '', until: '' }] })}>
                  <Plus className="h-3 w-3" /> Fase
                </Button>
              </div>
              {tt.phases.map((ph, j) => (
                <div key={j} className="grid items-end gap-2 rounded border border-border/60 p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Precio (S/)</Label>
                    <Input type="number" step="0.5" min={0} value={ph.priceSoles} onChange={(e) => patchPhase(i, j, { priceSoles: e.target.value })} placeholder="30" required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">
                      {j === tt.phases.length - 1 ? 'Hasta (vacío = hasta el evento)' : 'Sube el'}
                    </Label>
                    <Input type="datetime-local" min={min} value={ph.until} onChange={(e) => patchPhase(i, j, { until: e.target.value })} />
                  </div>
                  {tt.phases.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => patchTT(i, { phases: tt.phases.filter((_, m) => m !== j) })} aria-label="Quitar fase">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {tt.phases.length > 1 && (
                <p className="text-[10px] text-muted-foreground">
                  Cada fase arranca cuando termina la anterior. La última sin fecha vale hasta el evento.
                </p>
              )}
            </div>
          </div>
        ))}
      </section>

      {state.message && !state.ok && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{state.message}</p>
      )}
      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}

function FieldRow({ id, label, hint, required, error, children }: { id: string; label: string; hint?: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-1">
        {label}
        {required && <span className="text-primary">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="gradient" size="lg" disabled={pending}>
      {pending ? 'Creando…' : 'Crear evento →'}
    </Button>
  );
}
