import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Calendar, MapPin, ShieldCheck, ArrowRight, Instagram } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatPEN } from '@/lib/utils';
import { optimizedImage } from '@/lib/imageUrl';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// Landing público de marca (raíz <slug>.parygo.com) — rediseño v8
// Identidad ParyGo (crema + naranja). SOLO presentación: los datos, queries
// y links de compra son los mismos de siempre (marca + eventos + precios).
// =============================================================

type EvRow = { id: string; slug: string; name: string; starts_at: string; venue_name?: string | null; cover_url: string | null; min_age?: number | null };

const fmtFull = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }).format(new Date(iso));
const fmtShort = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'America/Lima' }).format(new Date(iso));

function instagramHref(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://instagram.com/${s.replace(/^@/, '')}`;
}

// Tarjeta de evento (próximo = link con precio; pasado = estático "Finalizado").
function EventCard({ e, from, past }: { e: EvRow; from?: number | null; past?: boolean }) {
  const img = (
    <div className="bl-ecard-img">
      {e.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={optimizedImage(e.cover_url, { width: 600, quality: 74 })} alt={`Flyer ${e.name}`} loading="lazy" decoding="async" />
      ) : (
        <span className="ph">{e.name}</span>
      )}
      {past && <span className="fin">Finalizado</span>}
      {!past && from != null && <span className="pr">desde {formatPEN(from)}</span>}
    </div>
  );
  const body = (
    <div className="bl-ecard-b">
      <h3>{e.name}</h3>
      <div className="d"><Calendar /> {fmtFull(e.starts_at)}</div>
    </div>
  );
  if (past) return <div className="bl-ecard">{img}{body}</div>;
  return <Link href={`/${e.slug}`} className="bl-ecard">{img}{body}</Link>;
}

export default async function BrandHomePage({ params }: { params: { brand: string } }) {
  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, whatsapp_e164, instagram')
    .eq('slug', params.brand)
    .is('archived_at', null)
    .maybeSingle();
  if (!brand) notFound();

  const now = new Date().toISOString();
  const [{ data: upcoming }, { data: past }] = await Promise.all([
    supabase.from('events').select('id, slug, name, starts_at, venue_name, cover_url, min_age')
      .eq('brand_id', brand.id).eq('is_published', true).is('archived_at', null).gte('starts_at', now).order('starts_at', { ascending: true }),
    supabase.from('events').select('id, slug, name, starts_at, cover_url')
      .eq('brand_id', brand.id).eq('is_published', true).is('archived_at', null).lt('starts_at', now).order('starts_at', { ascending: false }).limit(8),
  ]);

  const up = (upcoming ?? []) as EvRow[];
  const pastEvents = (past ?? []) as EvRow[];

  // "desde S/X" por evento próximo = mínimo de los tipos activos.
  const upIds = up.map((e) => e.id);
  const fromByEvent = new Map<string, number>();
  if (upIds.length) {
    const { data: tts } = await supabase.from('ticket_types').select('event_id, price_cents, is_active').in('event_id', upIds).eq('is_active', true);
    for (const t of (tts ?? []) as { event_id: string; price_cents: number }[]) {
      const cur = fromByEvent.get(t.event_id);
      if (cur === undefined || t.price_cents < cur) fromByEvent.set(t.event_id, t.price_cents);
    }
  }

  const featured = up[0] ?? null;
  const nextOnes = up.slice(1);
  const hasAny = up.length > 0 || pastEvents.length > 0;

  const igHref = instagramHref(brand.instagram);
  const waDigits = brand.whatsapp_e164 ? brand.whatsapp_e164.replace(/[^\d]/g, '') : null;
  const waHref = waDigits ? `https://wa.me/${waDigits}` : null;
  const featFrom = featured ? fromByEvent.get(featured.id) ?? null : null;

  return (
    <div className="bl">
      {/* glow ambiente */}
      <div className="bl-deco" aria-hidden="true"><div className="bl-glow a" /><div className="bl-glow b" /></div>

      {/* rails laterales (solo desktop ancho) */}
      {(igHref || waHref) && (
        <div className="bl-rail" aria-label="Redes de la marca">
          <span className="ln" />
          {igHref && <a href={igHref} target="_blank" rel="noopener noreferrer" aria-label="Instagram"><Instagram /></a>}
          {waHref && (
            <a href={waHref} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm0 18.15c-1.52 0-3.01-.41-4.3-1.18l-.31-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 01-1.26-4.36c0-4.54 3.7-8.23 8.24-8.23 4.54 0 8.23 3.69 8.23 8.23 0 4.54-3.69 8.43-8.21 8.43zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43-.14-.01-.31-.01-.48-.01-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z" /></svg>
            </a>
          )}
        </div>
      )}
      {featured && (
        <div className="bl-rail-r" aria-hidden="true"><span className="pt" /> Vendiendo ahora · {fmtShort(featured.starts_at)}</div>
      )}

      <main className="bl-main bl-wrap bl-hero">
        {featured ? (
          <div className="bl-hero-grid">
            <div className="bl-bgword" aria-hidden="true">{brand.name.toUpperCase()}</div>

            <Link href={`/${featured.slug}`} className="bl-poster bl-rise bl-d1" aria-label={`Comprar entradas para ${featured.name}`}>
              {featured.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={optimizedImage(featured.cover_url, { width: 900, quality: 78 })} alt={`Flyer ${featured.name}`} fetchPriority="high" decoding="async" />
              ) : (
                <span className="bl-poster__fallback">{featured.name}</span>
              )}
            </Link>

            <div className="bl-hero-info">
              <div className="bl-eyebrow bl-rise bl-d2"><span className="bl-live" /> Próximo evento — {brand.name}</div>
              <h1 className="bl-evt bl-rise bl-d2">{featured.name}</h1>
              <div className="bl-pills bl-rise bl-d3">
                <span className="bl-pill"><Calendar /> {fmtFull(featured.starts_at)}</span>
                {featured.venue_name && <span className="bl-pill"><MapPin /> {featured.venue_name}</span>}
                {(featured.min_age ?? 0) > 0 && <span className="bl-pill"><ShieldCheck /> +{featured.min_age}</span>}
              </div>
              {featFrom != null && <div className="bl-price bl-rise bl-d4">Entradas <b>desde {formatPEN(featFrom)}</b></div>}
              <Link href={`/${featured.slug}`} className="bl-cta bl-rise bl-d4">Comprar entradas <span className="arw">→</span></Link>
            </div>
          </div>
        ) : (
          <div className="bl-soon">
            <span className="e">{brand.name}</span>
            <h1>Próximamente</h1>
            <p>{hasAny ? 'Estamos preparando el próximo evento. Mira lo que hicimos antes 👇' : 'Estamos preparando el siguiente evento. Vuelve en unos días para no perdértelo.'}</p>
          </div>
        )}

        {/* marquee full-bleed (info real del evento) */}
        {featured && (
          <div className="bl-marquee" aria-hidden="true">
            <div className="bl-mk-track">
              {[0, 1].map((dup) => (
                <span key={dup}>
                  <span>Vendiendo ahora<i className="sep" /></span>
                  <span>{featured.name} · {fmtShort(featured.starts_at)}<i className="sep" /></span>
                  {featured.venue_name && <span>{featured.venue_name}<i className="sep" /></span>}
                  <span>Pago con Yape o tarjeta<i className="sep" /></span>
                  <span>Entrada con QR al instante<i className="sep" /></span>
                  {(featured.min_age ?? 0) > 0 && <span>+{featured.min_age}<i className="sep" /></span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* cómo funciona */}
        <div className="bl-seclabel"><span className="em">—</span> Cómo funciona <span className="ln" /></div>
        <div className="bl-how">
          <div className="bl-step"><span className="n">01</span><h4>Elige tus entradas</h4><p>VIP o General, las que quieras. Sin crear cuenta.</p></div>
          <div className="bl-step"><span className="n">02</span><h4>Paga con Yape o tarjeta</h4><p>Al toque, desde tu celular. Pago directo y seguro.</p></div>
          <div className="bl-step"><span className="n">03</span><h4>Recibe tu QR</h4><p>Te llega al correo al instante. Muéstralo en la puerta y listo.</p></div>
        </div>

        {/* próximos eventos (los demás futuros) */}
        {nextOnes.length > 0 && (
          <>
            <div className="bl-seclabel"><span className="em">—</span> Próximos eventos <span className="ln" /></div>
            <div className="bl-cards">
              {nextOnes.map((e) => <EventCard key={e.id} e={e} from={fromByEvent.get(e.id) ?? null} />)}
            </div>
          </>
        )}

        {/* eventos pasados (prueba social) */}
        {pastEvents.length > 0 && (
          <>
            <div className="bl-seclabel"><span className="em">—</span> Eventos pasados <span className="ln" /></div>
            <div className="bl-cards">
              {pastEvents.map((e) => <EventCard key={e.id} e={e} past />)}
            </div>
          </>
        )}
      </main>

      <footer className="bl-foot">
        <div className="bl-foot-in">
          <span className="pg">parygo<i>.</i></span>
          <div className="bl-foot-q">
            {(waHref || igHref) ? (
              <>
                ¿Consultas?{' '}
                {waHref && <a href={waHref} target="_blank" rel="noopener noreferrer">WhatsApp {brand.name}</a>}
                {waHref && igHref && ' · '}
                {igHref && <a href={igHref} target="_blank" rel="noopener noreferrer">Instagram</a>}
              </>
            ) : (
              <>{brand.name}</>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
