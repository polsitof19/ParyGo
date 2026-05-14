import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function BrandsListPage() {
  const supabase = createClient();
  const { data: brands } = await supabase
    .from('brands')
    .select('id, slug, name, contact_email, created_at')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            [ MARCAS ]
          </p>
          <h1 className="font-display text-4xl uppercase leading-none tracking-tight">
            Promotores
          </h1>
        </div>
        <Link href="/super/brands/new">
          <Button variant="gradient">+ Nueva marca</Button>
        </Link>
      </header>

      {!brands || brands.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Todavía no hay marcas. Creá la primera para arrancar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {brands.map((b) => (
            <Link key={b.id} href={`/super/brands/${b.slug}`}>
              <Card className="h-full transition-colors hover:border-secondary/50">
                <CardHeader>
                  <CardTitle className="font-display text-2xl uppercase">
                    {b.name}
                  </CardTitle>
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {b.slug}.parygo.com
                  </p>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {b.contact_email ?? <span className="italic">Sin email</span>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
