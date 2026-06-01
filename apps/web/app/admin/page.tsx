import Link from 'next/link';
import { Calendar, Plus, ScanLine, Settings } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InviteValidator } from './InviteValidator';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const user = await requireSession();
  const brandMembership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!brandMembership) return null;

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select(
      'id, slug, name, contact_email, whatsapp_e164, yape_number, yape_holder, theme_json, event_balance'
    )
    .eq('id', brandMembership.brandId)
    .single();
  if (!brand) return null;

  const { data: events } = await supabase
    .from('events')
    .select('id, slug, name, starts_at, is_published')
    .eq('brand_id', brand.id)
    .order('starts_at', { ascending: false });

  const theme = (brand.theme_json ?? {}) as {
    logo_url?: string | null;
    primary_color?: string;
    secondary_color?: string;
  };
  const balance = brand.event_balance ?? 0;
  const canCreate = balance > 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            [ {brand.name} · TU PANEL ]
          </p>
          <h1 className="font-display text-4xl uppercase leading-none tracking-tight">
            Tus eventos
          </h1>
        </div>
        {/* Create event — enabled only with balance; the RPC is the hard guard. */}
        {canCreate ? (
          <Link href="/admin/events/new">
            <Button variant="gradient">
              <Plus className="h-4 w-4" />
              Crear evento
            </Button>
          </Link>
        ) : (
          <Button variant="gradient" disabled title="Sin saldo de eventos">
            <Plus className="h-4 w-4" />
            Crear evento
          </Button>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Balance */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.18em]">
              Saldo de eventos
            </CardDescription>
            <CardTitle className="font-display text-5xl tabular-nums">{balance}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {canCreate
              ? `Podés crear ${balance} evento${balance === 1 ? '' : 's'} más.`
              : 'Sin saldo. Contactá a ParyGo para cargar un pack.'}
          </CardContent>
        </Card>

        {/* Brand config (display; edit lands in /admin/settings) */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Configuración de la marca</CardTitle>
              <CardDescription>Datos públicos y de cobro de {brand.name}.</CardDescription>
            </div>
            <Link href="/admin/settings">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4" />
                Editar
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">{brand.contact_email ?? '—'}</Field>
            <Field label="WhatsApp">{brand.whatsapp_e164 ?? '—'}</Field>
            <Field label="Yape número">{brand.yape_number ?? '—'}</Field>
            <Field label="Yape titular">{brand.yape_holder ?? '—'}</Field>
            <Field label="Logo">
              {theme.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={theme.logo_url} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                '—'
              )}
            </Field>
            <Field label="Colores">
              <span className="inline-flex items-center gap-1.5">
                <Swatch hex={theme.primary_color} />
                <Swatch hex={theme.secondary_color} />
              </span>
            </Field>
          </CardContent>
        </Card>
      </div>

      {/* Events list */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ EVENTOS ]
        </h2>
        {!events || events.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {canCreate
                ? 'Todavía no creaste ningún evento. Usá “Crear evento” para arrancar.'
                : 'No tenés eventos. Cuando ParyGo te cargue saldo vas a poder crear el primero.'}
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/admin/events/${e.id}`}>
                  <Card className="transition-colors hover:border-primary/50">
                    <CardContent className="flex items-center justify-between gap-3 py-4">
                      <div className="space-y-1">
                        <p className="font-display text-xl uppercase leading-none">{e.name}</p>
                        <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(e.starts_at).toLocaleString('es-PE', {
                            weekday: 'short',
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] ${
                          e.is_published ? 'bg-green/10 text-green' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {e.is_published ? 'Publicado' : 'Borrador'}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Staff de puerta (validadores) */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
          [ STAFF DE PUERTA ]
        </h2>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Validadores</CardTitle>
              <CardDescription>
                Invitá a tu staff a validar entradas en la puerta. Solo ven el
                escáner, nada más de tu panel.
              </CardDescription>
            </div>
            <Link href="/scan">
              <Button variant="default" size="sm">
                <ScanLine className="h-4 w-4" />
                Abrir escáner
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <InviteValidator />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 text-sm">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Swatch({ hex }: { hex?: string }) {
  if (!hex) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className="inline-block h-4 w-4 rounded-full border border-border"
      style={{ background: hex }}
      title={hex}
    />
  );
}
