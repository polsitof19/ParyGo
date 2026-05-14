import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MapPin, Calendar } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateQrDataUrl } from '@/lib/qr';
import { formatEventDate, whatsappLink } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Props = {
  params: { brand: string; uuid: string };
};

type TicketView = {
  id: string;
  qr_code: string;
  ticket_type_name: string;
  ticket_number: string;
  attendee_name: string | null;
  validated_at: string | null;
  invalidated_at: string | null;
  event: { name: string; starts_at: string; venue_name: string | null; venue_address: string | null } | null;
  brand: {
    slug: string;
    name: string;
    whatsapp_e164: string | null;
    theme_json: { primary_color?: string };
  } | null;
};

async function loadTicket(brandSlug: string, qrCode: string): Promise<TicketView | null> {
  // Validate uuid v4 shape early
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(qrCode)) {
    return null;
  }
  const admin = createAdminClient();
  const res = await admin
    .from('tickets')
    .select(`
      id, qr_code, ticket_type_name, ticket_number, attendee_name, validated_at, invalidated_at,
      event:events ( name, starts_at, venue_name, venue_address ),
      brand:brands ( slug, name, whatsapp_e164, theme_json )
    `)
    .eq('qr_code', qrCode)
    .maybeSingle();
  const data = res.data as unknown as TicketView | null;

  if (!data) return null;
  // Reject if subdomain doesn't match the brand of the ticket (defense in depth).
  if (data.brand?.slug !== brandSlug) return null;
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await loadTicket(params.brand, params.uuid);
  if (!t) return { title: 'Entrada no encontrada' };
  return {
    title: `${t.ticket_type_name} · ${t.event?.name ?? 'Mi entrada'}`,
    robots: { index: false, follow: false },
  };
}

export default async function TicketPage({ params }: Props) {
  const t = await loadTicket(params.brand, params.uuid);
  if (!t) notFound();

  const event = t.event;
  const brand = t.brand;

  if (t.invalidated_at) {
    return (
      <main className="container-narrow space-y-6 py-20 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-destructive">
          [ ENTRADA INVALIDADA ]
        </p>
        <h1 className="font-display text-3xl uppercase leading-none tracking-tight">
          Esta entrada ya no es válida
        </h1>
        <p className="text-muted-foreground">
          Fue devuelta o cancelada. Contacta al promotor si crees que es un error.
        </p>
      </main>
    );
  }

  const qrDataUrl = await generateQrDataUrl(t.qr_code);
  const ticketUrl = `https://${brand?.slug}.parygo.com/t/${t.qr_code}`;
  const accent = brand?.theme_json?.primary_color || '#FF1F8F';

  return (
    <main className="container-narrow space-y-8 py-12">
      <header className="text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ ENTRADA · {brand?.slug?.toUpperCase()} ]
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase leading-none tracking-tight md:text-4xl">
          {event?.name}
        </h1>
        {t.validated_at && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-green/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-green">
            ✓ Validada · {new Date(t.validated_at).toLocaleString('es-PE')}
          </p>
        )}
      </header>

      {/* The actual ticket */}
      <article
        className="relative mx-auto max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        style={{ boxShadow: `0 30px 80px -30px ${accent}40` }}
      >
        <div className="grid grid-cols-[1fr_auto]">
          {/* Left: info */}
          <div className="space-y-4 p-6">
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                ASISTENTE
              </p>
              <p className="font-medium">{t.attendee_name ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                TIPO
              </p>
              <p style={{ color: accent }} className="font-display text-2xl uppercase">
                {t.ticket_type_name}
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                CÓDIGO
              </p>
              <p className="font-mono text-sm">{t.ticket_number}</p>
            </div>
            {event && (
              <div className="space-y-2 border-t border-dashed border-border pt-4 text-xs">
                {event.starts_at && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatEventDate(event.starts_at)}
                  </p>
                )}
                {event.venue_name && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {event.venue_name}
                  </p>
                )}
              </div>
            )}
          </div>
          {/* Right: QR */}
          <div className="flex flex-col items-center justify-center gap-2 border-l border-dashed border-border bg-background/40 p-4">
            <img
              src={qrDataUrl}
              alt="QR de la entrada"
              className="h-40 w-40 rounded-md bg-white p-2"
            />
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              ESCANEAR EN PUERTA
            </p>
          </div>
        </div>
        {/* perforation cuts */}
        <span
          aria-hidden
          className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-background"
        />
        <span
          aria-hidden
          className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-background"
        />
      </article>

      {brand?.whatsapp_e164 && (
        <section className="space-y-3 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            ¿Vas con amigos? Comparte esta página
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href={whatsappLink(
                brand.whatsapp_e164.replace(/[^\d]/g, ''),
                `Mi entrada para ${event?.name}: ${ticketUrl}`
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm hover:bg-muted"
            >
              <span aria-hidden>📲</span>
              Enviarme a WhatsApp
            </a>
          </div>
        </section>
      )}

      {brand?.whatsapp_e164 && (
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          ¿Problema?{' '}
          <a
            href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-secondary underline-offset-4 hover:underline"
          >
            WhatsApp soporte
          </a>
        </p>
      )}
    </main>
  );
}
