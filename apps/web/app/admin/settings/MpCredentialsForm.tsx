'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateMpCredentialsAction, type SettingsState } from './actions';

const initial: SettingsState = { ok: false, message: null };

type Props = {
  hasAccessToken: boolean;
  hasPublicKey: boolean;
};

export function MpCredentialsForm({ hasAccessToken, hasPublicKey }: Props) {
  const [state, action] = useFormState(updateMpCredentialsAction, initial);
  const err = state.fieldErrors ?? {};
  const configured = hasAccessToken && hasPublicKey;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">[ COBRO TARJETA · MERCADOPAGO ]</h2>
        <span
          className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
            configured ? 'bg-green/15 text-green' : 'bg-muted text-muted-foreground'
          }`}
        >
          {configured ? 'Configurado' : 'No configurado'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Pegá tus credenciales de MercadoPago para habilitar el pago con tarjeta en tu checkout. Las
        guardamos encriptadas; nunca las mostramos de vuelta. Si no las cargás, tu checkout sigue
        funcionando solo con Yape.
      </p>

      <form action={action} className="space-y-4">
        <input type="hidden" name="intent" value="save" />
        <Field
          label="Access Token (APP_USR-… o TEST-…)"
          htmlFor="mp_access_token"
          error={err.mp_access_token}
        >
          <Input
            id="mp_access_token"
            name="mp_access_token"
            type="password"
            autoComplete="off"
            placeholder={hasAccessToken ? '•••••••••• (ya cargado — pegá uno nuevo para reemplazar)' : 'APP_USR-0000000000000000-...'}
          />
        </Field>
        <Field label="Public Key" htmlFor="mp_public_key" error={err.mp_public_key}>
          <Input
            id="mp_public_key"
            name="mp_public_key"
            type="password"
            autoComplete="off"
            placeholder={hasPublicKey ? '•••••••••• (ya cargada — pegá una nueva para reemplazar)' : 'APP_USR-xxxxxxxx-...'}
          />
        </Field>

        {state.message && (
          <p
            className={`rounded-md border px-4 py-2 text-sm ${
              state.ok
                ? 'border-green/40 bg-green/10 text-green'
                : 'border-destructive/40 bg-destructive/10 text-destructive'
            }`}
          >
            {state.message}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <SaveButton />
          {configured && <RemoveButton formAction={action} />}
        </div>
      </form>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="gradient" size="lg" disabled={pending}>
      {pending ? 'Validando con MercadoPago…' : 'Validar y guardar'}
    </Button>
  );
}

// Submits the same form with intent=remove via a formData override.
function RemoveButton({ formAction }: { formAction: (payload: FormData) => void }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="lg"
      disabled={pending}
      formAction={(fd) => {
        fd.set('intent', 'remove');
        formAction(fd);
      }}
    >
      Quitar credenciales
    </Button>
  );
}
