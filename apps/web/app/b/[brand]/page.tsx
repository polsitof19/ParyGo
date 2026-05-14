import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

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
    <main className="container-narrow flex min-h-[80vh] flex-col items-center justify-center gap-6 py-20 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
        [ {brand.name} · {params.brand} ]
      </p>
      <h1 className="font-display text-5xl uppercase leading-none tracking-tight md:text-6xl">
        Próximamente
      </h1>
      <p className="max-w-md text-muted-foreground">
        Estamos preparando el siguiente evento. Volvé en unos días o seguinos
        en redes para no perdértelo.
      </p>
    </main>
  );
}
