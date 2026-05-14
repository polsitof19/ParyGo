'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendMagicLink, type LoginState } from './actions';

const initialState: LoginState = { ok: false, message: null };

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useFormState(sendMagicLink, initialState);

  if (state.ok) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-lg border border-secondary/40 bg-secondary/5 px-6 py-8 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ LINK ENVIADO ]
        </p>
        <p className="text-foreground">
          Revisa tu bandeja en{' '}
          <strong className="font-mono">{state.message}</strong>. El link expira
          en 1 hora.
        </p>
        <p className="text-xs text-muted-foreground">
          ¿No te llegó? Revisa spam. Si igual no aparece, contacta a soporte.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mx-auto w-full max-w-md space-y-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="tu@email.com"
        />
      </div>
      {state.message && !state.ok && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {state.message}
        </p>
      )}
      <SubmitButton />
      <p className="text-center text-xs text-muted-foreground">
        Al continuar aceptas los Términos y la Política de Privacidad.
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="gradient"
      size="lg"
      className="w-full"
      disabled={pending}
    >
      {pending ? 'Enviando…' : 'Enviar link mágico →'}
    </Button>
  );
}
