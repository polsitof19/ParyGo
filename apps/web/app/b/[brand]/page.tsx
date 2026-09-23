import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatPEN } from '@/lib/utils';
import { isPubliclyOffered } from '@/lib/publicTicketGuard';
import { optimizedImage } from '@/lib/imageUrl';
import { fmtCuando, distrito } from '@/lib/eventoTexto';
import { PieMarca } from './Responsable';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// Home de marca (<slug>.parygo.com) — tema noche (2026-09-23)
// =============================================================
// Una sola cosa que hacer: elegir el evento y entrar. Arriba la marca con su
// logo a 56 (sin el nombre en texto si hay logo), "VENTA OFICIAL · LIMA" y
// una línea. Después, cada evento publicado como una tarjeta con la MISMA
// banda de la compra (el flyer entero sobre su copia difuminada), cuándo y
// dónde, el nombre y la acción. El primero lleva el único botón primario; los
// siguientes, la acción en texto.

type EvRow = {
  id: string; slug: string; name: string; starts_at: string;
  venue_name: string | null; venue_address: string | null;
  cover_url: string | null;
  is_free: boolean;
};

function Evento({ e, desde, primero }: { e: EvRow; desde: number | null; primero: boolean }) {
  const donde = [e.venue_name, distrito(e.venue_address)].filter(Boolean).join(', ');
  const gratis = e.is_free || desde === 0;
  return (
    <li className="bh-ev">
      <Link href={`/${e.slug}`} className="bh-ev__a">
        {e.cover_url ? (
          <span className="bh-ev__art">
            <span
              className="bh-ev__blur" aria-hidden="true"
              style={{ backgroundImage: `url(${JSON.stringify(optimizedImage(e.cover_url, { width: 96, quality: 40 }))})` }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={optimizedImage(e.cover_url, { width: 720, quality: 80 })} alt={`Flyer de ${e.name}`} decoding="async" />
          </span>
        ) : null}
        <span className="bh-ev__txt">
          <span className="bh-ev__cuando">{[fmtCuando(e.starts_at), donde].filter(Boolean).join(' · ')}</span>
          <span className="bh-ev__nm">{e.name}</span>
          {!gratis && desde != null && <span className="bh-ev__desde">Desde {formatPEN(desde)}</span>}
          <span className={`bh-ev__go${primero ? ' bh-ev__go--pri' : ''}`}>
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
    .select('id, slug, name, starts_at, venue_name, venue_address, cover_url, is_free')
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
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="bh-marca__logo" src={optimizedImage(logoUrl, { width: 480, quality: 85 })} alt="" height={56} decoding="async" />
            <h1 className="sr-only">{brand.name}</h1>
          </>
        ) : (
          <h1 className="bh-marca__nm">{brand.name}</h1>
        )}
        <p className="bh-marca__ofi">Venta oficial · Lima</p>
        <p className="bh-marca__p">
          Entradas oficiales de {brand.name}. Eliges, pagas y tu QR te llega al correo.
        </p>
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
            {eventos.map((e, i) => <Evento key={e.id} e={e} desde={desdePorEvento.get(e.id) ?? null} primero={i === 0} />)}
          </ol>
        </section>
      )}

      {/* Quién responde por los eventos de esta página, y quién vende. */}
      <PieMarca marca={brand} />
      <p className="c-foot bh-powered">
        powered by <a href="https://parygo.com" target="_blank" rel="noopener noreferrer"><b>parygo</b></a>
        <span className="c-powered__dot" aria-hidden="true" />
      </p>
    </main>
  );
}
