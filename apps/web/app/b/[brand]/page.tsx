import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Calendar, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatPEN } from '@/lib/utils';
import { isPubliclyOffered } from '@/lib/publicTicketGuard';
import { optimizedImage } from '@/lib/imageUrl';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// Home de marca (<slug>.parygo.com). Una sola cosa que hacer: elegir el
// evento y entrar a comprar. Logo y nombre los pone el header del layout;
// acá van las tarjetas —flyer, fecha, precio desde, "Comprar entradas"—
// y nada más. Los datos y los links de compra son los de siempre.
// =============================================================

type EvRow = {
  id: string; slug: string; name: string; starts_at: string;
  venue_name?: string | null; cover_url: string | null;
};

const fmtFecha = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }).format(new Date(iso));

function EventCard({ e, from }: { e: EvRow; from: number | null }) {
  return (
    <Link href={`/${e.slug}`} className="bl-card" aria-label={`Comprar entradas para ${e.name}`}>
      <div className="bl-card__flyer">
        {e.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedImage(e.cover_url, { width: 720, quality: 76 })} alt={`Flyer de ${e.name}`} loading="lazy" decoding="async" />
        ) : (
          <span className="bl-card__ph">{e.name}</span>
        )}
        {from != null && <span className="bl-card__from">desde {formatPEN(from)}</span>}
      </div>
      <div className="bl-card__body">
        <h2 className="bl-card__name">{e.name}</h2>
        <p className="bl-card__meta">
          <Calendar aria-hidden="true" /> {fmtFecha(e.starts_at)}
          {e.venue_name ? ` · ${e.venue_name}` : ''}
        </p>
        <span className="bl-card__cta">Comprar entradas <ArrowRight aria-hidden="true" /></span>
      </div>
    </Link>
  );
}

export default async function BrandHomePage({ params }: { params: { brand: string } }) {
  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, name')
    .eq('slug', params.brand)
    .is('archived_at', null)
    .maybeSingle();
  if (!brand) notFound();

  const now = new Date().toISOString();
  const { data: upcoming } = await supabase
    .from('events')
    .select('id, slug, name, starts_at, venue_name, cover_url')
    .eq('brand_id', brand.id)
    .eq('is_published', true)
    .is('archived_at', null)
    .gte('starts_at', now)
    .order('starts_at', { ascending: true });

  const up = (upcoming ?? []) as EvRow[];

  // "desde S/X" = el mínimo de los tipos activos que SE VENDEN al público
  // (isPubliclyOffered). Un tipo S/0 es cortesía, no está a la venta.
  const fromByEvent = new Map<string, number>();
  if (up.length) {
    const { data: tts } = await supabase
      .from('ticket_types')
      .select('event_id, price_cents, is_active')
      .in('event_id', up.map((e) => e.id))
      .eq('is_active', true);
    const porEvento = new Map<string, number[]>();
    for (const t of (tts ?? []) as { event_id: string; price_cents: number }[]) {
      porEvento.set(t.event_id, [...(porEvento.get(t.event_id) ?? []), t.price_cents]);
    }
    for (const [eventId, precios] of porEvento) {
      const ofrecidos = precios.filter((p) => isPubliclyOffered(p));
      if (ofrecidos.length) fromByEvent.set(eventId, Math.min(...ofrecidos));
    }
  }

  return (
    <main className="bl">
      {/* Calidez de parygo: dos manchas difusas en el color de la marca. */}
      <div className="bl-blobs" aria-hidden="true"><span /><span /></div>

      {up.length === 0 ? (
        <section className="bl-soon">
          <h1 className="bl-soon__t">Próximamente</h1>
          <p className="bl-soon__p">{brand.name} está preparando el siguiente evento. Vuelve en unos días.</p>
        </section>
      ) : (
        <section className="bl-grid">
          {up.map((e) => <EventCard key={e.id} e={e} from={fromByEvent.get(e.id) ?? null} />)}
        </section>
      )}
    </main>
  );
}
