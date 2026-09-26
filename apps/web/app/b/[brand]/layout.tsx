import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { createClient } from '@/lib/supabase/server';
import { optimizedImage } from '@/lib/imageUrl';
import { brandColor, brandFillPair, brandFillHover, brandMark } from './brandTheme';
// Orden: tokens del sistema primero (el tema noche vive ahí); client.css pone
// la superficie del comprador y compra.css / landing.css las pantallas.
import '../../styles/parygo-tokens.css';
import './client.css';
import './compra.css';
import './landing.css';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// La barra del navegador del teléfono toma el negro de la página, no el crema
// del layout raíz: si no, arriba de la compra quedaba una franja clara.
export const viewport: Viewport = { themeColor: '#0A0A0A' };

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
  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, slug, name, theme_json')
    .eq('slug', params.brand)
    .is('archived_at', null) // marca archivada → subdominio apagado (404 de todo)
    .maybeSingle();

  if (!brand) notFound();

  const theme = (brand.theme_json ?? {}) as { primary_color?: string; logo_url?: string | null };
  const primary = brandColor(theme.primary_color);
  // Par relleno+texto del color de marca, medido a AA 4.5:1 con las tintas
  // NEUTRAS del tema noche: blanco o #0A0A0A, nunca crema. Para Code da blanco
  // sobre #C8371F (5.22:1), que es el botón de la maqueta aprobada.
  const { fill: brandFill, on: onFill } = brandFillPair(theme.primary_color, 'neutra');
  // El hover del relleno es otro color MEDIDO, no un filtro de brillo.
  const brandFillHov = brandFillHover(theme.primary_color, 'neutra');
  // El color como MARCA (punto, barra de la fila elegida, anillo de foco):
  // aclarado lo mínimo para llegar a 3:1 contra el negro.
  const marca = brandMark(theme.primary_color);
  const logoUrl = theme.logo_url ?? null;

  return (
    <div
      className={`pg pg-noche client-shell ${GeistSans.variable}`}
      style={
        {
          '--brand': primary,
          '--brand-mark': marca,
          '--brand-fill': brandFill,
          '--on-fill': onFill,
          '--brand-fill-hover': brandFillHov,
        } as React.CSSProperties
      }
    >
      {/* El body del layout raíz está en Hanken (tailwind font-sans) y NO ve
          --font-geist-sans, que vive en este shell: con un var() sin definir la
          regla quedaba inválida y el body heredaba Hanken, que WebKit igual
          descargaba (los toasts y el route announcer viven ahí; WebKit la baja
          aunque solo la tenga el <html>). Acá va el nombre REAL de la familia
          que registró next/font, para html y body. */}
      <style>{`html:has(.client-shell),body:has(.client-shell){font-family:${GeistSans.style.fontFamily};background:#0A0A0A}`}</style>
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
