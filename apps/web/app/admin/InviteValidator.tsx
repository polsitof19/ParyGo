'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { inviteValidatorAction, type InviteValidatorState } from './actions';

const initial: InviteValidatorState = { ok: false, message: null };

export function InviteValidator() {
  const [state, action] = useFormState(inviteValidatorAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-2">
        <Input name="email" type="email" placeholder="staff@tumarca.com" required />
        {state.message && (
          <p className={`text-xs ${state.ok ? 'text-green' : 'text-destructive'}`}>{state.message}</p>
        )}
      </div>
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? 'Invitando…' : 'Invitar validador →'}
    </Button>
  );
}
