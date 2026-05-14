import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function SuperDashboardPage() {
  const supabase = createClient();
  const [
    { count: brandCount },
    { count: eventCount },
    { count: publishedEventCount },
    { count: paidOrderCount },
  ] = await Promise.all([
    supabase.from('brands').select('*', { count: 'exact', head: true }),
    supabase.from('events').select('*', { count: 'exact', head: true }),
    supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', true),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'paid'),
  ]);

  const stats = [
    { label: 'Marcas', value: brandCount ?? 0, href: '/super/brands' },
    { label: 'Eventos', value: eventCount ?? 0, href: '/super/events' },
    { label: 'Publicados', value: publishedEventCount ?? 0, href: '/super/events' },
    { label: 'Compras pagadas', value: paidOrderCount ?? 0, href: '/super/events' },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ RESUMEN ]
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight">
          Panel de control
        </h1>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-colors hover:border-secondary/50">
              <CardHeader>
                <CardDescription className="font-mono text-[10px] uppercase tracking-[0.18em]">
                  {s.label}
                </CardDescription>
                <CardTitle className="font-display text-4xl">{s.value}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          [ ACCIONES RÁPIDAS ]
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/super/brands/new">
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader>
                <CardTitle>+ Crear nueva marca</CardTitle>
                <CardDescription>
                  Setup inicial de un promotor nuevo. Define slug, logo,
                  colores, número Yape, credenciales MercadoPago.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/super/events/new">
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader>
                <CardTitle>+ Crear nuevo evento</CardTitle>
                <CardDescription>
                  Asignar evento a una marca existente. Configura fecha, venue,
                  cover, tipos de entrada.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </section>
    </div>
  );
}
