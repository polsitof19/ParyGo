'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface server-side errors in browser devtools during dev; in prod the
    // digest is what shows up in Vercel logs.
    console.error('ParyGo error boundary:', error);
  }, [error]);

  return (
    <main className="container-narrow flex min-h-[70vh] flex-col items-center justify-center gap-6 py-20 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-destructive">
        [ ALGO SALIÓ MAL ]
      </p>
      <h1 className="font-display text-4xl uppercase leading-none tracking-tight md:text-5xl">
        Tuvimos un problema
      </h1>
      <p className="max-w-md text-muted-foreground">
        No pudimos cargar esta pantalla. Reintenta; si sigue fallando,
        escríbenos por WhatsApp para que lo veamos.
      </p>
      {error.digest && (
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Ref: {error.digest}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-full border border-border px-6 text-sm"
        >
          Inicio
        </Link>
      </div>
    </main>
  );
}
