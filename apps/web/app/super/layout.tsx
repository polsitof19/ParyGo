import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { requireSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/super', label: 'Resumen' },
  { href: '/super/brands', label: 'Marcas' },
  { href: '/super/events', label: 'Eventos' },
] as const;

export default async function SuperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession({ superAdmin: true });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <Link
              href="/super"
              className="font-display text-xl uppercase tracking-tight"
            >
              ParyGo
              <span
                className="ml-1 inline-block h-1.5 w-1.5 -translate-y-1 rounded-full bg-primary align-middle"
                style={{ boxShadow: '0 0 8px hsl(var(--primary))' }}
              />
            </Link>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-secondary md:inline">
              [ SUPER ADMIN ]
            </span>
          </div>
          <nav className="hidden items-center gap-6 font-mono text-xs uppercase tracking-[0.18em] md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground md:inline">
              {user.email}
            </span>
            <form action="/auth/logout" method="post">
              <button
                type="submit"
                aria-label="Cerrar sesión"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="container flex-1 py-8">{children}</main>
    </div>
  );
}
