'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createEventAction, type FormState } from './actions';

const initial: FormState = { ok: false, message: null, fieldErrors: {} };

type Brand = { id: string; slug: string; name: string };

export function NewEventForm({
  brands,
  preselectedSlug,
}: {
  brands: Brand[];
  preselectedSlug: string | null;
}) {
  const [state, action] = useFormState(createEventAction, initial);
  const preselected = brands.find((b) => b.slug === preselectedSlug);

  return (
    <form action={action} className="space-y-6">
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ MARCA ]
        </h2>
        <Field id="brand_id" label="Promotor" required error={state.fieldErrors?.brand_id}>
          <select
            id="brand_id"
            name="brand_id"
            required
            defaultValue={preselected?.id ?? ''}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              Elegí marca
            </option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.slug})
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ EVENTO ]
        </h2>
        <Field id="name" label="Nombre del evento" required error={state.fieldErrors?.name}>
          <Input id="name" name="name" placeholder="Density · Noche 04" required />
        </Field>
        <Field id="slug" label="Slug" hint="Ej: density-04 → code.parygo.com/density-04" required error={state.fieldErrors?.slug}>
          <Input
            id="slug"
            name="slug"
            placeholder="density-04"
            pattern="^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$"
            required
          />
        </Field>
        <Field id="description" label="Descripción corta">
          <textarea
            id="description"
            name="description"
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="DJ Headliner · Club Foso · Lima"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="starts_at" label="Inicio" required error={state.fieldErrors?.starts_at}>
            <Input id="starts_at" name="starts_at" type="datetime-local" required />
          </Field>
          <Field id="ends_at" label="Fin estimado">
            <Input id="ends_at" name="ends_at" type="datetime-local" />
          </Field>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ VENUE ]
        </h2>
        <Field id="venue_name" label="Nombre del local">
          <Input id="venue_name" name="venue_name" placeholder="Club Foso" />
        </Field>
        <Field id="venue_address" label="Dirección">
          <Input id="venue_address" name="venue_address" placeholder="Av. Foso 123, Miraflores" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="venue_lat" label="Latitud (opcional)">
            <Input id="venue_lat" name="venue_lat" type="number" step="0.00001" placeholder="-12.0464" />
          </Field>
          <Field id="venue_lng" label="Longitud (opcional)">
            <Input id="venue_lng" name="venue_lng" type="number" step="0.00001" placeholder="-77.0428" />
          </Field>
        </div>
        <Field id="min_age" label="Edad mínima">
          <Input id="min_age" name="min_age" type="number" min={0} max={99} defaultValue={18} />
        </Field>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ POLÍTICAS ]
        </h2>
        <Field id="refund_policy" label="Política de devolución (texto visible al comprador)">
          <textarea
            id="refund_policy"
            name="refund_policy"
            rows={2}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue="Sin devolución post-pago salvo cancelación del evento."
          />
        </Field>
      </section>

      {state.message && !state.ok && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.message}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
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
    <div className="flex justify-end">
      <Button type="submit" variant="gradient" size="lg" disabled={pending}>
        {pending ? 'Creando…' : 'Crear evento →'}
      </Button>
    </div>
  );
}
