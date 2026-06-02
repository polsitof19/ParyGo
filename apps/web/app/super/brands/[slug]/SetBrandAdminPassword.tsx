'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setBrandAdminPasswordAction, type SetBrandPwdState } from './actions';

const init: SetBrandPwdState = { ok: false, message: null };

export function SetBrandAdminPassword({ brandId, userId, slug }: { brandId: string; userId: string; slug: string }) {
  const [state, action] = useFormState(setBrandAdminPasswordAction, init);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="brand_id" value={brandId} />
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="slug" value={slug} />
      <Input name="password" type="password" placeholder="contraseña (8+)" autoComplete="new-password" className="h-8 w-44 text-xs" />
      <Btn />
      {state.message && (
        <span className={`text-xs ${state.ok ? 'text-green' : 'text-destructive'}`}>{state.message}</span>
      )}
    </form>
  );
}

function Btn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? '…' : 'Setear contraseña'}
    </Button>
  );
}
