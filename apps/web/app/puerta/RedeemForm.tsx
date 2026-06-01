'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { redeemGateCodeAction, type RedeemState } from './actions';

const initial: RedeemState = { ok: false, message: null };

export function RedeemForm() {
  const [state, action] = useFormState(redeemGateCodeAction, initial);
  return (
    <form action={action} className="space-y-4">
      <Input
        name="code"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        autoFocus
        autoComplete="one-time-code"
        placeholder="••••••"
        className="h-16 text-center font-display text-4xl tracking-[0.4em]"
      />
      {state.message && !state.ok && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {state.message}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Entrando…' : 'Entrar a la puerta →'}
    </Button>
  );
}
