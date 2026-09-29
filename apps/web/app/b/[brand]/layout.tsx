import { cache } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { createClient } from '@/lib/supabase/server';
import { optimizedImage } from '@/lib/imageUrl';
import { brandColor, brandFillPair, brandFillHover } from './brandTheme';
import { paletaCompra } from '@/lib/temaCompra.mjs';
// Orden: tokens del sistema primero (el tema noche vive ahí); client.css pone
// la superficie del comprador y compra.css / landing.css las pantallas.
import '../../styles/parygo-tokens.css';
import './client.css';
import './compra.css';
import './landing.css';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// La marca, una sola vez por pedido (la usan el layout y generateViewport).
const marcaDe = cache(async (slug: string) => {
  const supabase = createClient();
  const { data } = await supabase
    .from('brands')
    .select('id, slug, name, theme_json, tema_compra')
    .eq('slug', slug)
    .is('archived_at', null) // marca archivada → subdominio apagado (404 de todo)
    .maybeSingle();
  return data;
});

// La barra del navegador del teléfono toma el fondo de la página (según el
// tema de la marca), no el crema del layout raíz: si no, quedaba una franja.
export async function generateViewport({ params }: { params: { brand: string } }): Promise<Viewport> {
  const b = await marcaDe(params.brand);
  const theme = (b?.theme_json ?? {}) as { primary_color?: string };
  return { themeColor: paletaCompra(b?.tema_compra, theme.primary_color).hex.bg };
}

// Layout de las páginas públicas por marca. El middleware reescribe
// <slug>.parygo.com/* → /b/<slug>/*, así que este segmento recibe el slug.
//
// TEMA NOCHE (2026-09-23): fondo negro neutro, Geist en todo, el color de la
// marca como acento. Esta superficie NO carga Bricolage ni Hanken: la letra
// es Geist (paquete oficial `geist`, next/font/local, OFL) y nada más.
export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { brand: string };
}) {
  const brand = await marcaDe(params.brand);

  if (!brand) notFound();

  const theme = (brand.theme_json ?? {}) as { primary_color?: string; logo_url?: string | null };
  const primary = brandColor(theme.primary_color);
  // Par relleno+texto del color de marca, medido a AA 4.5:1 con las tintas
  // NEUTRAS del tema noche: blanco o #0A0A0A, nunca crema. Para Code da blanco
  // sobre #C8371F (5.22:1), que es el botón de la maqueta aprobada.
  const { fill: brandFill, on: onFill } = brandFillPair(theme.primary_color, 'neutra');
  // El hover del relleno es otro color MEDIDO, no un filtro de brillo.
  const brandFillHov = brandFillHover(theme.primary_color, 'neutra');
  // TEMA (0076): blanco, crema, negro o el color de la marca. La paleta sale
  // de lib/temaCompra.mjs (la misma que mide scripts/check-temas-compra.mjs)
  // y va como variables CSS. El color como MARCA (punto, barra de la fila
  // elegida, anillo de foco) viene medido a 3:1 contra el fondo del tema. Con
  // el tema "marca" el fondo YA es el color, así que el botón es de tinta.
  const pal = paletaCompra(brand.tema_compra, theme.primary_color);
  const marca = pal.vars['--brand-mark'];
  const fill = pal.boton ? pal.boton.fill : brandFill;
  const on = pal.boton ? pal.boton.onFill : onFill;
  const fillHov = pal.boton ? pal.boton.hover : brandFillHov;
  const logoUrl = theme.logo_url ?? null;

  return (
    <div
      className={`pg pg-noche client-shell tema-${pal.tema}${pal.oscuro ? '' : ' tema-claro'} ${GeistSans.variable}`}
      style={
        {
          ...pal.vars,
          '--brand': primary,
          '--brand-mark': marca,
          '--brand-fill': fill,
          '--on-fill': on,
          '--brand-fill-hover': fillHov,
        } as React.CSSProperties
      }
    >
      {/* El body del layout raíz está en Hanken (tailwind font-sans) y NO ve
          --font-geist-sans, que vive en este shell: con un var() sin definir la
          regla quedaba inválida y el body heredaba Hanken, que WebKit igual
          descargaba (los toasts y el route announcer viven ahí; WebKit la baja
          aunque solo la tenga el <html>). Acá va el nombre REAL de la familia
          que registró next/font, para html y body. */}
      <style>{`html:has(.client-shell),body:has(.client-shell){font-family:${GeistSans.style.fontFamily};background:${pal.hex.bg}}`}</style>
      <header className="c-header">
        <div className="c-header__inner">
          <Link href="/" className="c-lockup" aria-label={`${brand.name}, inicio`}>
            {logoUrl ? (
              // El logo REAL, a 26px de alto y con su ancho: nada de círculo
              // ni de recorte. Con logo, el nombre no se repite en texto.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="c-lockup__logo"
                src={optimizedImage(logoUrl, { width: 240, quality: 85 })}
                alt={brand.name}
                height={26}
                decoding="async"
              />
            ) : (
              <span className="c-lockup__name">{brand.name}</span>
            )}
            <span className="c-lockup__ofi">Venta oficial</span>
          </Link>
          <span className="c-powered">
            powered by{' '}
            <a href="https://parygo.com" target="_blank" rel="noopener noreferrer"><b>parygo</b></a>
            <span className="c-powered__dot" aria-hidden="true" />
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
