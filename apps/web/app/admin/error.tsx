'use client';

import { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('brand admin error:', error);
  }, [error]);
  return (
    <div className="space-y-6 py-12 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-destructive">
        [ ERROR ADMIN ]
      </p>
      <h1 className="font-display text-3xl uppercase leading-none tracking-tight">
        No pudimos cargar tu panel
      </h1>
      <p className="text-muted-foreground">
        Reintenta. Si sigue, contacta a soporte ParyGo.
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
