import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatPEN } from '@/lib/utils';
import { isPubliclyOffered } from '@/lib/publicTicketGuard';
import { optimizedImage } from '@/lib/imageUrl';
import { BrandLogo } from '@/components/BrandLogo';
import { fmtCuando, distrito } from '@/lib/eventoTexto';
import { PieMarca } from './Responsable';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// Home de marca (<slug>.parygo.com), en el sistema de la compra.
// Una sola cosa que hacer: elegir el evento y entrar. Arriba la marca
// (logo, nombre, "Venta oficial"); después cada evento publicado como
// una pieza grande —el flyer ENTERO, cuándo y dónde, el nombre y la
// acción—, sin cajas: papel, tinta, hairlines. Estética Canvas: manda
// la imagen, el color de marca no porta texto.
//
// Reemplaza a la home vieja (.bl: tarjetas blancas con sombra, blobs,
// pastilla "desde" sobre el flyer). Ni una regla de aquella queda.
// =============================================================

type EvRow = {
  id: string; slug: string; name: string; starts_at: string;
  venue_name: string | null; venue_address: string | null;
  cover_url: string | null; cover_w: number | null; cover_h: number | null;
  is_free: boolean;
};

// Un flyer más alto que 4:5 (una captura de pantalla) no estira la página:
// va entero dentro de un cuadro 4:5 sobre una copia difuminada de sí mismo,
// igual que el hero de la compra. Sin medidas, se asume 4:5.
const TOPE = 4 / 5;

function Evento({ e, desde }: { e: EvRow; desde: number | null }) {
  const ratio = e.cover_w && e.cover_h ? e.cover_w / e.cover_h : TOPE;
  const alto = ratio < TOPE;
  const donde = [e.venue_name, distrito(e.venue_address)].filter(Boolean).join(' · ');
  const gratis = e.is_free || desde === 0;
  return (
    <li className="bh-ev">
      <Link href={`/${e.slug}`} className="bh-ev__a">
        <span
          className={`bh-ev__art${alto ? ' bh-ev__art--alto' : ''}${e.cover_url ? '' : ' bh-ev__art--vacio'}`}
          style={{ aspectRatio: String(Math.max(ratio, TOPE)) }}
        >
          {e.cover_url ? (
            <>
              {alto && (
                <span
                  className="bh-ev__blur" aria-hidden="true"
                  style={{ backgroundImage: `url(${JSON.stringify(optimizedImage(e.cover_url, { width: 480, quality: 40 }))})` }}
                />
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={optimizedImage(e.cover_url, { width: 900, quality: 78 })}
                alt={`Flyer de ${e.name}`}
                width={e.cover_w ?? undefined} height={e.cover_h ?? undefined}
                decoding="async"
              />
            </>
          ) : (
            <span className="bh-ev__inicial" aria-hidden="true">{(e.name.trim()[0] ?? '·').toUpperCase()}</span>
          )}
        </span>
        <span className="bh-ev__txt">
          <span className="bh-ev__cuando">{fmtCuando(e.starts_at)}</span>
          {donde && <span className="bh-ev__donde">{donde}</span>}
          <span className="bh-ev__nm">{e.name}</span>
          {!gratis && desde != null && <span className="bh-ev__desde">Desde {formatPEN(desde)}</span>}
          <span className="bh-ev__go">
            {gratis ? 'Reclama tu entrada gratis' : 'Comprar entradas'} <ArrowRight aria-hidden="true" />
          </span>
        </span>
      </Link>
    </li>
  );
}

export default async function BrandHomePage({ params }: { params: { brand: string } }) {
  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, theme_json, whatsapp_e164, contact_email')
    .eq('slug', params.brand)
    .is('archived_at', null)
    .maybeSingle();
  if (!brand) notFound();
  const logoUrl = ((brand.theme_json ?? {}) as { logo_url?: string | null }).logo_url ?? null;

  const now = new Date().toISOString();
  const { data: upcoming } = await supabase
    .from('events')
    .select('id, slug, name, starts_at, venue_name, venue_address, cover_url, cover_w, cover_h, is_free')
    .eq('brand_id', brand.id)
    .eq('is_published', true)
    .is('archived_at', null)
    .gte('starts_at', now)
    .order('starts_at', { ascending: true });

  const eventos = (upcoming ?? []) as EvRow[];

  // "Desde S/X" = el mínimo de los tipos activos que SE OFRECEN al público
  // (isPubliclyOffered). Una cortesía no está a la venta; un evento GRATIS
  // ofrece sus tipos en 0 y entonces la acción es reclamar, no comprar.
  const desdePorEvento = new Map<string, number>();
  if (eventos.length) {
    const { data: tts } = await supabase
      .from('ticket_types')
      .select('event_id, price_cents, is_active, is_courtesy')
      .in('event_id', eventos.map((e) => e.id))
      .eq('is_active', true);
    const esGratis = new Map(eventos.map((e) => [e.id, e.is_free === true]));
    for (const t of (tts ?? []) as { event_id: string; price_cents: number; is_courtesy: boolean }[]) {
      if (!isPubliclyOffered(t.price_cents, { eventoEsGratis: esGratis.get(t.event_id), esCortesia: t.is_courtesy })) continue;
      const ya = desdePorEvento.get(t.event_id);
      if (ya === undefined || t.price_cents < ya) desdePorEvento.set(t.event_id, t.price_cents);
    }
  }

  return (
    <main className="bh">
      <header className="bh-marca">
        {logoUrl ? (
          <BrandLogo src={logoUrl} alt="" size={64} eager ring />
        ) : (
          <span className="bh-marca__ini" aria-hidden="true">{(brand.name.trim()[0] ?? '?').toUpperCase()}</span>
        )}
        <span className="bh-marca__txt">
          <h1 className="bh-marca__nm">{brand.name}</h1>
          {/* Debajo del nombre, no encima: una etiqueta en mayúsculas sobre el
              h1 es el kicker que delata una página generada. */}
          <span className="bh-marca__ofi">Venta oficial</span>
        </span>
      </header>

      {eventos.length === 0 ? (
        <section className="bh-vacio">
          <h2 className="bh-vacio__t">Próximamente</h2>
          <p className="bh-vacio__p">{brand.name} está preparando su próximo evento. Vuelve en unos días.</p>
        </section>
      ) : (
        <section aria-labelledby="bh-eventos">
          <h2 className="bh-sec" id="bh-eventos">{eventos.length === 1 ? 'Próximo evento' : 'Próximos eventos'}</h2>
          <ol className="bh-lista">
            {eventos.map((e) => <Evento key={e.id} e={e} desde={desdePorEvento.get(e.id) ?? null} />)}
          </ol>
        </section>
      )}

      {/* Quién responde por los eventos de esta página. */}
      <PieMarca marca={brand} />
    </main>
  );
}
