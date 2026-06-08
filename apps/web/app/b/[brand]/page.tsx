import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Calendar, MapPin, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatPEN } from '@/lib/utils';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type EvRow = { id: string; slug: string; name: string; starts_at: string; venue_name?: string | null; cover_url: string | null };

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }).format(new Date(iso));

function Flyer({ url, name }: { url: string | null; name: string }) {
  return (
    <div className="c-flyer">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Flyer ${name}`} loading="lazy" />
      ) : (
        <div className="c-flyer__fallback"><span>{name}</span></div>
      )}
    </div>
  );
}

function EventCard({ e, from, past }: { e: EvRow; from?: number | null; past?: boolean }) {
  const inner = (
    <>
      <Flyer url={e.cover_url} name={e.name} />
      {past && <span className="c-finalizado">Finalizado</span>}
      <div className="c-evcard__body">
        <p className="c-evcard__name">{e.name}</p>
        <p className="c-evcard__meta"><Calendar className="h-3.5 w-3.5" /> {fmtDate(e.starts_at)}</p>
        {!past && from != null && <p className="c-evcard__price">desde {formatPEN(from)}</p>}
      </div>
    </>
  );
  if (past) return <div className={`c-evcard c-evcard--past`} style={{ position: 'relative' }}>{inner}</div>;
  return <Link href={`/${e.slug}`} className="c-evcard" style={{ position: 'relative' }}>{inner}</Link>;
}

export default async function BrandHomePage({ params }: { params: { brand: string } }) {
  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, whatsapp_e164')
    .eq('slug', params.brand)
    .maybeSingle();
  if (!brand) notFound();

  const now = new Date().toISOString();
  const [{ data: upcoming }, { data: past }] = await Promise.all([
    supabase.from('events').select('id, slug, name, starts_at, venue_name, cover_url')
      .eq('brand_id', brand.id).eq('is_published', true).gte('starts_at', now).order('starts_at', { ascending: true }),
    supabase.from('events').select('id, slug, name, starts_at, cover_url')
      .eq('brand_id', brand.id).eq('is_published', true).lt('starts_at', now).order('starts_at', { ascending: false }).limit(8),
  ]);

  const up = (upcoming ?? []) as EvRow[];
  const pastEvents = (past ?? []) as EvRow[];

  // "desde S/X" por evento próximo = mínimo de los tipos activos (precio base).
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

  // Marca sin ningún evento publicado → Próximamente cálido.
  if (!hasAny) {
    return (
      <main className="c-state" style={{ minHeight: '70vh', display: 'grid', placeContent: 'center' }}>
        <span className="c-eyebrow">{brand.name}</span>
        <h1 className="c-h1" style={{ fontSize: 'clamp(40px,10vw,64px)', marginTop: 10 }}>Próximamente</h1>
        <p className="c-muted" style={{ marginTop: 12 }}>Estamos preparando el siguiente evento. Volvé en unos días para no perdértelo.</p>
      </main>
    );
  }

  return (
    <main className="c-wrap" style={{ paddingBottom: 8 }}>
      {/* Destacado: el PRÓXIMO más cercano */}
      {featured ? (
        <section className="c-brandhead">
          <div className="c-feat">
            <Link href={`/${featured.slug}`}><Flyer url={featured.cover_url} name={featured.name} /></Link>
            <div>
              <span className="c-eyebrow c-feat__eyebrow">Próximo evento · {brand.name}</span>
              <h2>{featured.name}</h2>
              <div className="c-chips" style={{ marginTop: 0, marginBottom: 18 }}>
                <span className="c-chip"><Calendar className="h-4 w-4" /> {fmtDate(featured.starts_at)}</span>
                {featured.venue_name && <span className="c-chip"><MapPin className="h-4 w-4" /> {featured.venue_name}</span>}
              </div>
              {fromByEvent.get(featured.id) != null && (
                <p className="c-feat__from" style={{ marginBottom: 18 }}>Entradas <b>desde {formatPEN(fromByEvent.get(featured.id)!)}</b></p>
              )}
              <Link href={`/${featured.slug}`} className="c-btn c-btn--brand c-btn--lg">Comprar entradas <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </section>
      ) : (
        // Solo eventos pasados → un "Próximamente" arriba + la prueba social abajo
        <section className="c-brandhead" style={{ textAlign: 'center' }}>
          <span className="c-eyebrow">{brand.name}</span>
          <h1 className="c-brandname" style={{ marginTop: 8 }}>Próximamente</h1>
          <p className="c-muted" style={{ marginTop: 8, maxWidth: 460, marginInline: 'auto' }}>Estamos preparando el próximo evento. Mirá lo que hicimos antes 👇</p>
        </section>
      )}

      {/* Próximos eventos (los demás futuros) */}
      {nextOnes.length > 0 && (
        <section className="c-section">
          <h3 className="c-section__h">Próximos eventos <span className="cnt">{nextOnes.length}</span></h3>
          <div className="c-evgrid">
            {nextOnes.map((e) => <EventCard key={e.id} e={e} from={fromByEvent.get(e.id) ?? null} />)}
          </div>
        </section>
      )}

      {/* Eventos pasados (prueba social) — solo si hay */}
      {pastEvents.length > 0 && (
        <section className="c-section">
          <h3 className="c-section__h">Eventos pasados</h3>
          <div className="c-evgrid">
            {pastEvents.map((e) => <EventCard key={e.id} e={e} past />)}
          </div>
        </section>
      )}

      {/* Footer con contacto de la marca */}
      <p className="c-foot">
        {brand.whatsapp_e164 ? (
          <>¿Consultas? <a href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)', fontWeight: 600 }}>WhatsApp {brand.name}</a></>
        ) : (
          <>{brand.name}</>
        )}
      </p>
    </main>
  );
}
