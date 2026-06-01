'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { loadPackAction, type PackState } from './actions';

const initial: PackState = { ok: false, message: null };

const PACK_OPTIONS = [
  { pack: 1, label: 'Pack 1 — S/200' },
  { pack: 3, label: 'Pack 3 — S/540' },
  { pack: 5, label: 'Pack 5 — S/850' },
  { pack: 10, label: 'Pack 10 — S/1500' },
];

export function LoadPackForm({
  brandId,
  slug,
}: {
  brandId: string;
  slug: string;
}) {
  const [state, action] = useFormState(loadPackAction, initial);

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-md border border-dashed border-border p-4 sm:flex-row sm:items-end"
    >
      <input type="hidden" name="brand_id" value={brandId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="flex-1 space-y-2">
        <Label htmlFor="pack-select">Cargar pack de eventos</Label>
        <select
          id="pack-select"
          name="pack"
          defaultValue="3"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {PACK_OPTIONS.map((o) => (
            <option key={o.pack} value={o.pack}>
              {o.label}
            </option>
          ))}
        </select>
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
    <Button type="submit" variant="gradient" disabled={pending}>
      {pending ? 'Cargando…' : 'Cargar pack →'}
    </Button>
  );
}
