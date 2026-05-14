import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container-narrow flex min-h-screen flex-col items-center justify-center gap-6 py-20 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
        [ 404 · NO ENCONTRADO ]
      </p>
      <h1 className="font-display text-5xl uppercase leading-none">
        Página no encontrada
      </h1>
      <p className="text-muted-foreground">
        El link puede haber expirado o el evento ya no existe.
      </p>
      <Link
        href="/"
        className="font-mono text-xs uppercase tracking-[0.18em] text-secondary underline-offset-4 hover:underline"
      >
        ← Volver al inicio
      </Link>
    </main>
  );
}
