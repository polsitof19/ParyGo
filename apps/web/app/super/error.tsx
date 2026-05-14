'use client';

import { useEffect } from 'react';

export default function SuperError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('super admin error:', error);
  }, [error]);
  return (
    <div className="space-y-6 py-12 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-destructive">
        [ ERROR PANEL ]
      </p>
      <h1 className="font-display text-3xl uppercase leading-none tracking-tight">
        Algo se rompió en el panel
      </h1>
      <p className="text-muted-foreground">
        Prueba recargar. Si persiste, revisa los logs en Supabase / Vercel.
      </p>
      {error.digest && (
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Ref: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
      >
        Reintentar
      </button>
    </div>
  );
}
