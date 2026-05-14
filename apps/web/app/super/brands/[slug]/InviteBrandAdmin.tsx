'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inviteBrandAdminAction, type InviteState } from './actions';

const initial: InviteState = { ok: false, message: null };

export function InviteBrandAdmin({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [state, action] = useFormState(inviteBrandAdminAction, initial);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border border-dashed border-border p-4 sm:flex-row sm:items-end">
      <input type="hidden" name="brand_id" value={brandId} />
      <div className="flex-1 space-y-2">
        <Label htmlFor="invite-email">Invitar a {brandName}</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          placeholder="promotor@code.com.pe"
          required
        />
        {state.message && (
          <p className={`text-xs ${state.ok ? 'text-green' : 'text-destructive'}`}>
            {state.message}
          </p>
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
      {pending ? 'Enviando…' : 'Invitar →'}
    </Button>
  );
}
