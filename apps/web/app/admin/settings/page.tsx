import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from './SettingsForm';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) return null;

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, contact_email, whatsapp_e164, yape_number, yape_holder, theme_json')
    .eq('id', membership.brandId)
    .single();
  if (!brand) return null;

  const theme = (brand.theme_json ?? {}) as {
    logo_url?: string | null;
    primary_color?: string;
    secondary_color?: string;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Volver
      </Link>

      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ CONFIGURACIÓN · {brand.name} ]
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight">
          Tu marca
        </h1>
        <p className="text-sm text-muted-foreground">
          Editá tus datos públicos y de cobro. Los cambios se aplican al instante.
        </p>
      </header>

      <SettingsForm
        contactEmail={brand.contact_email ?? ''}
        whatsapp={brand.whatsapp_e164 ?? ''}
        yapeNumber={brand.yape_number ?? ''}
        yapeHolder={brand.yape_holder ?? ''}
        primaryColor={theme.primary_color ?? '#FF1F8F'}
        secondaryColor={theme.secondary_color ?? '#00E5FF'}
        logoUrl={theme.logo_url ?? null}
      />
    </div>
  );
}
