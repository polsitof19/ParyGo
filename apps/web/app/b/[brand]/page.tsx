import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Brand root: redirect to the most recent published event, or render
// a friendly "coming soon" if there's none yet.
export default async function BrandHomePage({
  params,
}: {
  params: { brand: string };
}) {
  const supabase = createClient();

  const { data: brand } = await supabase
    .from('brands')
    .select('id, name')
    .eq('slug', params.brand)
    .maybeSingle();

  if (!brand) notFound();

  const { data: events } = await supabase
    .from('events')
    .select('slug, starts_at')
    .eq('brand_id', brand.id)
    .eq('is_published', true)
    .order('starts_at', { ascending: false })
    .limit(1);

  const next = events?.[0];
  if (next) {
    redirect(`/${next.slug}`);
  }

  return (
    <main className="c-state" style={{ minHeight: '72vh', display: 'grid', placeContent: 'center' }}>
      <span className="c-eyebrow">{brand.name}</span>
      <h1 className="c-h1" style={{ fontSize: 'clamp(40px,10vw,64px)', marginTop: 10 }}>Próximamente</h1>
      <p className="c-muted" style={{ marginTop: 12 }}>
        Estamos preparando el siguiente evento. Volvé en unos días o seguinos en redes para no perdértelo.
      </p>
    </main>
  );
}
