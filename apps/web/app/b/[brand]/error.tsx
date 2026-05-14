'use client';

import { useEffect } from 'react';

export default function BrandError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('brand site error:', error);
  }, [error]);
  return (
    <main className="container-narrow flex min-h-[70vh] flex-col items-center justify-center gap-6 py-20 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-destructive">
        [ NO PUDIMOS CARGAR ]
      </p>
      <h1 className="font-display text-4xl uppercase leading-none tracking-tight md:text-5xl">
        Algo falló al cargar este evento
      </h1>
      <p className="max-w-md text-muted-foreground">
        Reintenta en unos segundos. Si te quedaste a mitad de un pago, no se
        cobró: cualquier compra recién queda confirmada cuando recibes el QR.
      </p>
      {error.digest && (
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Ref: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
      >
        Reintentar
      </button>
    </main>
  );
}
