import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import { createClient } from '@/lib/supabase/server';
import { brandColor, brandInk, contrastOn, withAlpha } from './brandTheme';
import { optimizedImage } from '@/lib/imageUrl';
import './client.css';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const bricolage = Bricolage_Grotesque({ weight: ['700', '800'], subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const hanken = Hanken_Grotesk({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-hanken', display: 'swap' });

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
      className={`client-shell ${bricolage.variable} ${hanken.variable}`}
      style={
        {
          '--brand': primary,
          '--on-brand': onBrand,
          '--brand-soft': brandSoft,
          '--brand-ink': brandTextInk,
        } as React.CSSProperties
      }
    >
      <header className="c-header c-header--brand">
        <div className="c-header__inner">
          <Link href="/" className="c-brandlink" aria-label={brand.name}>
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={optimizedImage(logoUrl, { width: 280, quality: 88 })} alt="" className="c-logo" height={48} loading="eager" decoding="async" />
            )}
            <span className="c-hdr-name">{brand.name}</span>
          </Link>
          <span className="c-powered">
            powered by{' '}
            <a href="https://parygo.com" target="_blank" rel="noopener noreferrer">parygo</a>
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
