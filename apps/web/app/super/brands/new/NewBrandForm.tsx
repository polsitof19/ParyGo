'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createBrandAction, type FormState } from './actions';

const initial: FormState = { ok: false, message: null, fieldErrors: {} };

export function NewBrandForm() {
  const [state, action] = useFormState(createBrandAction, initial);

  return (
    <form action={action} className="space-y-6">
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ IDENTIDAD ]
        </h2>
        <Field id="name" label="Nombre del promotor" required error={state.fieldErrors?.name}>
          <Input id="name" name="name" placeholder="Code" required />
        </Field>
        <Field
          id="slug"
          label="Slug (subdominio)"
          hint="Solo letras, números y guiones. Se usa como code.parygo.com"
          required
          error={state.fieldErrors?.slug}
        >
          <Input
            id="slug"
            name="slug"
            placeholder="code"
            pattern="^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$"
            required
          />
        </Field>
        <Field id="contact_email" label="Email del brand admin" required error={state.fieldErrors?.contact_email}>
          <Input
            id="contact_email"
            name="contact_email"
            type="email"
            placeholder="contacto@code.com.pe"
            required
          />
        </Field>
        <Field id="whatsapp_e164" label="WhatsApp del promotor (formato +51...)" error={state.fieldErrors?.whatsapp_e164}>
          <Input
            id="whatsapp_e164"
            name="whatsapp_e164"
            placeholder="+51999000000"
            pattern="^\+\d{8,15}$"
          />
        </Field>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ YAPE ]
        </h2>
        <p className="text-xs text-muted-foreground">
          El número Yape se muestra al comprador para que pueda yapear
          directamente al promotor.
        </p>
        <Field id="yape_number" label="Número Yape" error={state.fieldErrors?.yape_number}>
          <Input id="yape_number" name="yape_number" placeholder="999 999 999" />
        </Field>
        <Field id="yape_holder" label="Titular Yape">
          <Input id="yape_holder" name="yape_holder" placeholder="Nombre como aparece en Yape" />
        </Field>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ MERCADOPAGO · OPCIONAL ]
        </h2>
        <p className="text-xs text-muted-foreground">
          Las credenciales se cifran en la base de datos. Si no las tenés
          todavía, podés crear la marca sin ellas y añadirlas después.
        </p>
        <Field id="mp_access_token" label="Access Token (producción)" error={state.fieldErrors?.mp_access_token}>
          <Input
            id="mp_access_token"
            name="mp_access_token"
            placeholder="APP_USR-..."
            autoComplete="off"
          />
        </Field>
        <Field id="mp_public_key" label="Public Key">
          <Input id="mp_public_key" name="mp_public_key" placeholder="APP_USR-..." autoComplete="off" />
        </Field>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ TEMA VISUAL ]
        </h2>
        <Field id="primary_color" label="Color primario (hex)">
          <Input
            id="primary_color"
            name="primary_color"
            placeholder="#FF1F8F"
            pattern="^#[0-9A-Fa-f]{6}$"
            defaultValue="#FF1F8F"
          />
        </Field>
        <Field id="secondary_color" label="Color secundario (hex)">
          <Input
            id="secondary_color"
            name="secondary_color"
            placeholder="#00E5FF"
            pattern="^#[0-9A-Fa-f]{6}$"
            defaultValue="#00E5FF"
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          Logo y cover se suben después en /super/brands/[slug]/assets.
        </p>
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
        {pending ? 'Creando…' : 'Crear marca →'}
      </Button>
    </div>
  );
}
