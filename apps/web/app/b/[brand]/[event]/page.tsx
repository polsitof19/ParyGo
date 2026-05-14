import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Calendar, MapPin, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatPEN } from '@/lib/utils';
import { EventCheckoutPanel } from './EventCheckoutPanel';
import { EventStructuredData } from './EventStructuredData';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type Props = {
  params: { brand: string; event: string };
};

async function loadEvent(brandSlug: string, eventSlug: string) {
  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, slug, name, theme_json, whatsapp_e164, yape_number, yape_holder, contact_email')
    .eq('slug', brandSlug)
    .maybeSingle();
  if (!brand) return null;

  const { data: event } = await supabase
    .from('events')
    .select(`
      id, slug, name, description, starts_at, ends_at,
      venue_name, venue_address, venue_lat, venue_lng,
      cover_url, min_age, refund_policy, is_published
    `)
    .eq('brand_id', brand.id)
    .eq('slug', eventSlug)
    .eq('is_published', true)
    .maybeSingle();
  if (!event) return null;

  const { data: ticketTypes } = await supabase
    .from('ticket_types')
    .select('id, name, description, price_cents, capacity, sold, sort_order, color_hex, is_active')
    .eq('event_id', event.id)
    .eq('is_active', true)
    .order('sort_order')
    // Display order: HIGHEST price first (anchoring). After fetching by
    // sort_order, we resort client-side to allow promoters to override.
    ;
  return { brand, event, ticketTypes: ticketTypes ?? [] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadEvent(params.brand, params.event);
  if (!data) return { title: 'Evento no encontrado' };
  const { brand, event } = data;
  const title = `${event.name} · ${brand.name}`;
  const description = event.description ?? `Entradas para ${event.name}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: event.cover_url ? [event.cover_url] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: event.cover_url ? [event.cover_url] : undefined,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function EventPage({ params }: Props) {
  const data = await loadEvent(params.brand, params.event);
  if (!data) notFound();
  const { brand, event, ticketTypes } = data;

  const startsAt = new Date(event.starts_at);
  const totalCapacity = ticketTypes.reduce((acc, t) => acc + t.capacity, 0);
  const totalSold = ticketTypes.reduce((acc, t) => acc + t.sold, 0);

  const theme = (brand.theme_json ?? {}) as { primary_color?: string };
  const primary = theme.primary_color || '#FF1F8F';

  return (
    <>
      <EventStructuredData brand={brand} event={event} ticketTypes={ticketTypes} />

      <article className="pb-32">
        {/* COVER */}
        <section
          className="relative isolate overflow-hidden"
          style={{
            background: event.cover_url
              ? undefined
              : `radial-gradient(circle at 70% 30%, ${primary}55, transparent 50%), radial-gradient(circle at 30% 70%, var(--secondary-hex,#00E5FF)44, transparent 55%), linear-gradient(135deg,#2a0f3a,#0d1b2e)`,
          }}
        >
          {event.cover_url && (
            <img
              src={event.cover_url}
              alt=""
              className="absolute inset-0 -z-10 h-full w-full object-cover opacity-70"
            />
          )}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/60 to-background/10" />

          <div className="container py-16 md:py-28">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-white/80">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: primary, boxShadow: `0 0 10px ${primary}` }}
              />
              VENDIENDO AHORA
            </div>
            <h1 className="mt-4 max-w-4xl font-display text-5xl uppercase leading-none tracking-tight md:text-7xl lg:text-8xl">
              {event.name}
            </h1>
            {event.description && (
              <p className="mt-6 max-w-2xl text-base text-white/85 md:text-lg">
                {event.description}
              </p>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-xs uppercase tracking-[0.16em] text-white/80 md:text-sm">
              <span className="inline-flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {new Intl.DateTimeFormat('es-PE', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(startsAt)}
              </span>
              {event.venue_name && (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {event.venue_name}
                </span>
              )}
              {event.min_age > 0 && (
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  +{event.min_age}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* CAPACITY METER */}
        {totalCapacity > 0 && (
          <section className="border-y border-border bg-card/40">
            <div className="container flex flex-wrap items-center justify-between gap-3 py-3 font-mono text-[10px] uppercase tracking-[0.18em]">
              <span className="text-muted-foreground">
                Capacidad · {totalSold} / {totalCapacity}
              </span>
              <div className="flex h-1 w-full max-w-md gap-px overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, (totalSold / totalCapacity) * 100)}%`,
                    background: `linear-gradient(90deg, ${primary}, var(--secondary-hex,#00E5FF))`,
                  }}
                />
              </div>
              <span className="text-secondary">EN VIVO</span>
            </div>
          </section>
        )}

        {/* CHECKOUT PANEL */}
        <EventCheckoutPanel
          brand={brand}
          event={event}
          ticketTypes={ticketTypes}
        />

        {/* VENUE + REFUND POLICY */}
        <section className="container mt-16 grid gap-8 md:grid-cols-2">
          {event.venue_address && (
            <div className="space-y-3 rounded-lg border border-border bg-card p-6">
              <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
                [ DÓNDE ]
              </h3>
              <p className="font-display text-xl uppercase">{event.venue_name}</p>
              <p className="text-sm text-muted-foreground">{event.venue_address}</p>
              {event.venue_lat && event.venue_lng && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${event.venue_lat},${event.venue_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-secondary underline-offset-4 hover:underline"
                >
                  Ver en Google Maps →
                </a>
              )}
            </div>
          )}
          {event.refund_policy && (
            <div className="space-y-3 rounded-lg border border-border bg-card p-6">
              <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
                [ DEVOLUCIONES ]
              </h3>
              <p className="text-sm text-muted-foreground">{event.refund_policy}</p>
            </div>
          )}
        </section>

        {/* SUPPORT */}
        {brand.whatsapp_e164 && (
          <section className="container mt-10">
            <p className="text-center font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              ¿Problema con tu compra?{' '}
              <a
                href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-secondary underline-offset-4 hover:underline"
              >
                WhatsApp soporte
              </a>
            </p>
          </section>
        )}

        {/* Display info that may be expected in PEN amounts */}
        <p className="sr-only">
          Entradas desde {formatPEN(
            Math.min(...(ticketTypes.length ? ticketTypes.map((t) => t.price_cents) : [0]))
          )}
          .
        </p>
      </article>
    </>
  );
}
