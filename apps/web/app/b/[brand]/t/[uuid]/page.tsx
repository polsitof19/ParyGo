import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MapPin, Calendar } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateQrSvg } from '@/lib/qr';
import { formatEventDate, whatsappLink } from '@/lib/utils';

// SVG QR generation has no Node-only dependencies (no pngjs/Buffer), so this
// route runs fine on Cloudflare Pages edge runtime.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Props = {
  params: { brand: string; uuid: string };
};

type BrandTheme = {
  primary_color?: string;
  secondary_color?: string;
  logo_url?: string | null;
  cover_url?: string | null;
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
    theme_json: BrandTheme;
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

  const qrSvg = await generateQrSvg(t.qr_code);
  const ticketUrl = `https://${brand?.slug}.parygo.com/t/${t.qr_code}`;
  const theme = brand?.theme_json ?? {};
  const primary = theme.primary_color || '#FF1F8F';
  const secondary = theme.secondary_color || '#00E5FF';
  const logoUrl = theme.logo_url ?? null;

  return (
    <main
      className="mx-auto w-full max-w-md space-y-6 px-4 py-6 sm:py-10"
      // Brand tokens scoped to the ticket page subtree.
      style={
        {
          '--primary-hex': primary,
          '--secondary-hex': secondary,
        } as React.CSSProperties
      }
    >
      {/* Brand identity: logo first, name as fallback. Mobile-first sizing. */}
      <header className="flex flex-col items-center gap-3 text-center">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={brand?.name ?? 'Brand'}
            className="h-12 w-auto max-w-[180px] object-contain"
          />
        ) : (
          <p
            className="font-display text-lg font-semibold uppercase tracking-tight"
            style={{ color: primary }}
          >
            {brand?.name}
          </p>
        )}
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          [ Entrada digital ]
        </p>
        {t.validated_at && (
          <p className="inline-flex items-center gap-2 rounded-full bg-green/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-green">
            ✓ Validada · {new Date(t.validated_at).toLocaleString('es-PE')}
          </p>
        )}
      </header>

      {/* Ticket card — branded accents on a neutral card. */}
      <article
        className="relative overflow-hidden rounded-3xl border border-border bg-card"
        style={{
          // Soft brand glow around the ticket.
          boxShadow: `0 24px 60px -24px ${primary}55, 0 0 0 1px ${secondary}22 inset`,
        }}
      >
        {/* Top color band — primary→secondary gradient, brand identity. */}
        <div
          aria-hidden
          className="h-1.5 w-full"
          style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }}
        />

        {/* Event hero */}
        <div className="space-y-1 px-6 pt-6">
          <p
            className="font-mono text-[10px] uppercase tracking-[0.2em]"
            style={{ color: secondary }}
          >
            {t.ticket_type_name}
          </p>
          <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-[26px]">
            {event?.name}
          </h1>
          {event?.starts_at && (
            <p className="flex items-center gap-1.5 pt-1 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" aria-hidden />
              {formatEventDate(event.starts_at)}
            </p>
          )}
          {event?.venue_name && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {event.venue_name}
            </p>
          )}
        </div>

        {/* Attendee + code */}
        <div className="space-y-3 px-6 pt-5">
          <div className="space-y-0.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Asistente
            </p>
            <p className="text-base font-semibold">{t.attendee_name ?? '—'}</p>
          </div>
          <div className="space-y-0.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Código
            </p>
            <p className="font-mono text-sm tracking-wider">{t.ticket_number}</p>
          </div>
        </div>

        {/* Perforation separator */}
        <div className="relative mt-6">
          <div className="border-t border-dashed border-border/80" />
          <span
            aria-hidden
            className="absolute -left-3 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background"
          />
          <span
            aria-hidden
            className="absolute -right-3 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background"
          />
        </div>

        {/* QR — full-width on mobile, generous padding */}
        <div className="flex flex-col items-center gap-2 px-6 py-6">
          <div
            role="img"
            aria-label="QR de la entrada"
            className="h-48 w-48 rounded-xl bg-white p-3 [&_svg]:h-full [&_svg]:w-full"
            style={{ boxShadow: `0 0 0 1px ${primary}22` }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Escanear en puerta
          </p>
        </div>
      </article>

      {/* Share / support — full-width buttons, mobile-first */}
      {brand?.whatsapp_e164 && (
        <section className="space-y-2">
          <a
            href={whatsappLink(
              brand.whatsapp_e164.replace(/[^\d]/g, ''),
              `Mi entrada para ${event?.name}: ${ticketUrl}`
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 items-center justify-center gap-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{
              background: `linear-gradient(135deg, ${primary}, ${secondary})`,
            }}
          >
            <span aria-hidden>📲</span>
            Enviarme por WhatsApp
          </a>
          <p className="text-center text-xs text-muted-foreground">
            ¿Problema?{' '}
            <a
              href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline"
              style={{ color: secondary }}
            >
              WhatsApp soporte
            </a>
          </p>
        </section>
      )}
    </main>
  );
}
