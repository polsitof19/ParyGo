import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Layout for brand-scoped public pages. The middleware rewrites
// <slug>.parygo.com/* → /_brand/<slug>/*  so this segment receives the brand slug.
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
    .select('id, slug, name, theme_json, whatsapp_e164')
    .eq('slug', params.brand)
    .maybeSingle();

  if (!brand) notFound();

  const theme = (brand.theme_json ?? {}) as {
    primary_color?: string;
    secondary_color?: string;
    logo_url?: string | null;
  };
  const primary = theme.primary_color || '#FF1F8F';
  const secondary = theme.secondary_color || '#00E5FF';

  return (
    <div
      className="min-h-screen"
      style={
        {
          // Brand colors override the global magenta/cyan tokens on this subtree
          '--primary-hex': primary,
          '--secondary-hex': secondary,
        } as React.CSSProperties
      }
    >
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-display text-lg uppercase tracking-tight"
          >
            {theme.logo_url ? (
              <img src={theme.logo_url} alt={brand.name} className="h-7 w-auto" />
            ) : (
              <span>{brand.name}</span>
            )}
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            powered by{' '}
            <a
              href="https://parygo.pages.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-secondary"
            >
              parygo
            </a>
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
