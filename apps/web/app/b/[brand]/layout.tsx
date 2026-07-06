import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Bricolage_Grotesque, Hanken_Grotesk, Archivo, Inter, Instrument_Serif, Fredoka, Nunito } from 'next/font/google';
import { createClient } from '@/lib/supabase/server';
import { brandColor, brandInk, contrastOn, withAlpha } from './brandTheme';
import { BrandLogo } from '@/components/BrandLogo';
import './client.css';
import './landing.css';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const bricolage = Bricolage_Grotesque({ weight: ['700', '800'], subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const hanken = Hanken_Grotesk({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-hanken', display: 'swap' });
// Identidad ParyGo del landing de marca (mockup): Archivo (display), Inter (cuerpo), Instrument Serif (acento itálico).
const archivo = Archivo({ weight: ['500', '600', '700', '800', '900'], subsets: ['latin'], variable: '--font-archivo', display: 'swap' });
const inter = Inter({ weight: ['400', '500', '600'], subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const instrument = Instrument_Serif({ weight: '400', style: 'italic', subsets: ['latin'], variable: '--font-instrument', display: 'swap' });
// Landing de marca (.bl) — estilo limpio/pastel/juvenil. Solo se usan dentro de .bl
// (vía --bl-disp/--bl-body). El checkout del evento (.c-checkout-canvas) usa Archivo
// para títulos (override en client.css v3); el resto del shell mantiene Bricolage/Hanken.
const fredoka = Fredoka({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-fredoka', display: 'swap' });
const nunito = Nunito({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], style: ['normal', 'italic'], variable: '--font-nunito', display: 'swap' });

// Layout de las páginas públicas por marca. El middleware reescribe
// <slug>.parygo.com/* → /b/<slug>/*, así que este segmento recibe el slug.
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
  const onBrand = contrastOn(primary);
  const brandSoft = withAlpha(primary, 0.12);
  // Variante legible del color de marca para texto/acento sobre crema (oscurece
  // los colores muy claros como el amarillo; deja intactos los medios/oscuros).
  const brandTextInk = brandInk(theme.primary_color);
  const logoUrl = theme.logo_url ?? null;

  return (
    <div
      className={`client-shell ${bricolage.variable} ${hanken.variable} ${archivo.variable} ${inter.variable} ${instrument.variable} ${fredoka.variable} ${nunito.variable}`}
      style={
        {
          '--brand': primary,
          '--on-brand': onBrand,
          '--brand-soft': brandSoft,
          '--brand-ink': brandTextInk,
        } as React.CSSProperties
      }
    >
      <header className="c-header">
        <div className="c-header__inner">
          <Link href="/" className="c-lockup" aria-label={brand.name}>
            {logoUrl ? (
              <BrandLogo src={logoUrl} alt="" size={36} eager ring />
            ) : (
              <span className="c-lockup__mark"><span /></span>
            )}
            {/* El nombre se muestra SIEMPRE (con o sin logo): un logo-ícono claro
                podría fundirse con una barra clara y dejar la marca invisible. */}
            <span className="c-lockup__name">{brand.name}</span>
          </Link>
          <span className="c-powered">
            powered by{' '}
            <a href="https://parygo.com" target="_blank" rel="noopener noreferrer"><b>parygo</b></a>
            <span className="c-powered__dot" />
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
