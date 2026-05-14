import { LoginForm } from './LoginForm';

export const runtime = 'edge';

export const metadata = {
  title: 'Iniciar sesión',
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  return (
    <main className="container-narrow flex min-h-screen flex-col justify-center gap-10 py-20">
      <header className="space-y-3 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ PARYGO · ACCESO ]
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight md:text-5xl">
          Inicia sesión con tu email
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          Te enviamos un link mágico al email. Click y entrás. Sin contraseñas.
        </p>
      </header>

      <LoginForm next={searchParams.next} />

      {searchParams.error && (
        <p className="mx-auto max-w-md rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
          {decodeURIComponent(searchParams.error)}
        </p>
      )}

      {process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP && (
        <p className="text-center font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          ¿Eres comprador buscando tu entrada?{' '}
          <a
            href={`https://wa.me/${process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-secondary underline-offset-4 hover:underline"
          >
            Soporte WhatsApp
          </a>
        </p>
      )}
    </main>
  );
}
