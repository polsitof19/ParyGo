import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function EventsListPage() {
  const supabase = createClient();
  const { data: events } = await supabase
    .from('events')
    .select('id, slug, name, starts_at, is_published, brand:brands(slug, name)')
    .order('starts_at', { ascending: false });

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            [ EVENTOS ]
          </p>
          <h1 className="font-display text-4xl uppercase leading-none tracking-tight">
            Todos los eventos
          </h1>
        </div>
        <Link href="/super/events/new">
          <Button variant="gradient">+ Nuevo evento</Button>
        </Link>
      </header>

      {!events || events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Sin eventos todavía. Crea una marca primero, después un evento.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {events.map((e) => {
            const brand = Array.isArray(e.brand) ? e.brand[0] : e.brand;
            return (
              <Link key={e.id} href={`/super/events/${e.id}`}>
                <Card className="transition-colors hover:border-secondary/50">
                  <CardHeader className="flex flex-row items-center justify-between gap-4">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {brand?.name ?? '—'} · {brand?.slug ?? ''}
                      </p>
                      <CardTitle className="font-display text-2xl uppercase">
                        {e.name}
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {new Date(e.starts_at).toLocaleString('es-PE', {
                          weekday: 'short',
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${
                        e.is_published
                          ? 'bg-green/10 text-green'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${e.is_published ? 'bg-green' : 'bg-muted-foreground'}`}
                      />
                      {e.is_published ? 'Publicado' : 'Borrador'}
                    </span>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
