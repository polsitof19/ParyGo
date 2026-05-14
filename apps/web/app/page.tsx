import Link from 'next/link';

// app.parygo.com root. Currently a stub — super admin lives at /super, brand
// admins at /admin. When auth lands, this page redirects based on role.

export default function AppRootPage() {
  return (
    <main className="container-narrow flex min-h-screen flex-col items-center justify-center gap-8 py-20 text-center">
      <div className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ PARYGO · CONTROL PANEL ]
        </p>
        <h1 className="font-display text-5xl uppercase leading-none tracking-tight md:text-7xl">
          Acceso al <span className="gradient-text">panel</span>
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          Si eres promotor de un evento creado en ParyGo, inicia sesión con el
          email que registramos para ti.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold uppercase tracking-wider text-primary-foreground transition-all hover:shadow-[0_0_40px_-8px_rgba(255,31,143,0.6)]"
        >
          Iniciar sesión →
        </Link>
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          ¿Quieres tu propia plataforma?{' '}
          <a
            href="https://parygo.pages.dev#packs"
            className="underline-offset-4 hover:underline"
          >
            Ver paquetes
          </a>
        </span>
      </div>
    </main>
  );
}
