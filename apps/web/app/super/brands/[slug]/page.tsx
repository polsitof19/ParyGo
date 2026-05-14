import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InviteBrandAdmin } from './InviteBrandAdmin';
import { publicEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function BrandDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, slug, name, contact_email, whatsapp_e164, yape_number, yape_holder, theme_json, created_at')
    .eq('slug', params.slug)
    .maybeSingle();

  if (!brand) notFound();

  const [{ data: events }, { data: members }] = await Promise.all([
    supabase
      .from('events')
      .select('id, slug, name, starts_at, is_published')
      .eq('brand_id', brand.id)
      .order('starts_at', { ascending: false }),
    supabase
      .from('brand_members')
      .select('id, role, display_name, user_id, created_at')
      .eq('brand_id', brand.id),
  ]);

  const brandUrl = `https://${brand.slug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}`;

  return (
    <div className="space-y-8">
      <Link
        href="/super/brands"
        className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Volver
      </Link>

      <header className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            [ MARCA · {brand.slug} ]
          </p>
          <h1 className="font-display text-4xl uppercase leading-none tracking-tight">
            {brand.name}
          </h1>
          <a
            href={brandUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.18em] text-secondary underline-offset-4 hover:underline"
          >
            {brandUrl.replace('https://', '')}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex gap-2">
          <Link href={`/super/events/new?brand=${brand.slug}`}>
            <Button variant="gradient">+ Crear evento</Button>
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Email">{brand.contact_email ?? '—'}</Row>
            <Row label="WhatsApp">{brand.whatsapp_e164 ?? '—'}</Row>
            <Row label="Yape número">{brand.yape_number ?? '—'}</Row>
            <Row label="Yape titular">{brand.yape_holder ?? '—'}</Row>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Eventos</CardTitle>
            <CardDescription>
              {events?.length ?? 0} evento{events?.length === 1 ? '' : 's'} creado
              {events?.length === 1 ? '' : 's'} para esta marca.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!events || events.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin eventos todavía. Créa el primero con el botón de arriba.
              </p>
            ) : (
              <ul className="space-y-2">
                {events.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
                  >
                    <div>
                      <Link
                        href={`/super/events/${e.id}`}
                        className="font-medium hover:underline"
                      >
                        {e.name}
                      </Link>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {new Date(e.starts_at).toLocaleString('es-PE')}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] ${
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
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Brand admin</CardTitle>
            <CardDescription>
              Invita al promotor por email para que pueda editar este evento y
              ver sus ventas. Recibe un link mágico de acceso.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {members && members.filter((m) => m.role === 'brand_admin').length > 0 ? (
              <ul className="space-y-2">
                {members
                  .filter((m) => m.role === 'brand_admin')
                  .map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
                    >
                      <span>{m.display_name ?? 'Brand admin'}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        Activo
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aún no hay brand admin invitado.
              </p>
            )}
            <InviteBrandAdmin brandId={brand.id} brandName={brand.name} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="text-right">{children}</span>
    </div>
  );
}
