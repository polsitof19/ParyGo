'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateBrandSettingsAction, type SettingsState } from './actions';

const initial: SettingsState = { ok: false, message: null };

type Props = {
  contactEmail: string;
  whatsapp: string;
  yapeNumber: string;
  yapeHolder: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
};

export function SettingsForm(props: Props) {
  const [state, action] = useFormState(updateBrandSettingsAction, initial);
  const [primary, setPrimary] = useState(props.primaryColor);
  const [secondary, setSecondary] = useState(props.secondaryColor);
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-8">
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">[ CONTACTO ]</h2>
        <Field label="Email de contacto" htmlFor="contact_email" error={err.contact_email}>
          <Input id="contact_email" name="contact_email" type="email" defaultValue={props.contactEmail} placeholder="contacto@tumarca.com" />
        </Field>
        <Field label="WhatsApp (formato +51999000111)" htmlFor="whatsapp_e164" error={err.whatsapp_e164}>
          <Input id="whatsapp_e164" name="whatsapp_e164" type="tel" inputMode="tel" pattern="^\+\d{8,15}$" defaultValue={props.whatsapp} placeholder="+51999000111" />
        </Field>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">[ COBRO YAPE ]</h2>
        <p className="text-xs text-muted-foreground">Estos datos los ven tus compradores al pagar. Cambian al instante en tu página pública.</p>
        <Field label="Número de Yape" htmlFor="yape_number" error={err.yape_number}>
          <Input id="yape_number" name="yape_number" defaultValue={props.yapeNumber} placeholder="999000111" />
        </Field>
        <Field label="Titular de la cuenta" htmlFor="yape_holder" error={err.yape_holder}>
          <Input id="yape_holder" name="yape_holder" defaultValue={props.yapeHolder} placeholder="Tu Marca SAC" />
        </Field>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">[ MARCA VISUAL ]</h2>
        <Field label="Logo (PNG, JPG, WEBP o SVG · máx 2MB)" htmlFor="logo" error={err.logo}>
          <div className="flex items-center gap-3">
            {props.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.logoUrl} alt="logo actual" className="h-12 w-12 rounded-full border border-border object-cover" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted-foreground">sin logo</span>
            )}
            <input
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-secondary-foreground hover:file:bg-secondary/80"
            />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Color primario" htmlFor="primary_color" error={err.primary_color}>
            <div className="flex items-center gap-2">
              <input type="color" name="primary_color" id="primary_color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-10 w-14 cursor-pointer rounded border border-border bg-transparent" />
              <span className="font-mono text-xs uppercase text-muted-foreground">{primary}</span>
            </div>
          </Field>
          <Field label="Color secundario" htmlFor="secondary_color" error={err.secondary_color}>
            <div className="flex items-center gap-2">
              <input type="color" name="secondary_color" id="secondary_color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-10 w-14 cursor-pointer rounded border border-border bg-transparent" />
              <span className="font-mono text-xs uppercase text-muted-foreground">{secondary}</span>
            </div>
          </Field>
        </div>

        {/* Live preview */}
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Vista previa</p>
          <div className="h-12 rounded-lg" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }} />
        </div>
      </section>

      {state.message && (
        <p className={`rounded-md border px-4 py-2 text-sm ${state.ok ? 'border-green/40 bg-green/10 text-green' : 'border-destructive/40 bg-destructive/10 text-destructive'}`}>
          {state.message}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}

function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="gradient" size="lg" disabled={pending}>
      {pending ? 'Guardando…' : 'Guardar configuración'}
    </Button>
  );
}
