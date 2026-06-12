import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SettingsForm } from './SettingsForm';
import { MpCredentialsForm } from './MpCredentialsForm';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) return null;
  const impersonating = ctx.impersonating;

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, contact_email, whatsapp_e164, yape_number, yape_holder, theme_json')
    .eq('id', ctx.brandId)
    .single();
  if (!brand) return null;

  // MP credentials status (service_role; never decrypts, returns only booleans).
  const admin = createAdminClient();
  const { data: mpStatus } = await admin.rpc('get_brand_mp_status', {
    p_brand_id: ctx.brandId,
  });
  const mp = (Array.isArray(mpStatus) ? mpStatus[0] : null) ?? {
    has_access_token: false,
    has_public_key: false,
  };

  const theme = (brand.theme_json ?? {}) as {
    logo_url?: string | null;
    primary_color?: string;
    secondary_color?: string;
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <Link href="/admin" className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> Tu panel
      </Link>

      <header style={{ marginBottom: 22 }}>
        <span className="eyebrow">Configuración · {brand.name}</span>
        <h1 className="s-h1" style={{ marginTop: 4 }}>Tu marca</h1>
        <p className="s-card__desc">
          {impersonating
            ? 'Estás viendo la configuración de la marca en solo lectura. No puedes editarla desde aquí.'
            : 'Editá tus datos públicos y de cobro. Los cambios se aplican al instante.'}
        </p>
      </header>

      {impersonating && (
        <p className="s-banner" style={{ background: 'var(--cream-2)', color: 'var(--ink-2)', marginBottom: 16 }} role="status">
          Solo lectura — los datos se muestran tal cual, sin posibilidad de editarlos.
        </p>
      )}

      <SettingsForm
        contactEmail={brand.contact_email ?? ''}
        whatsapp={brand.whatsapp_e164 ?? ''}
        yapeNumber={brand.yape_number ?? ''}
        yapeHolder={brand.yape_holder ?? ''}
        primaryColor={theme.primary_color ?? '#FF1F8F'}
        secondaryColor={theme.secondary_color ?? '#00E5FF'}
        logoUrl={theme.logo_url ?? null}
        readOnly={impersonating}
      />

      <div style={{ marginTop: 16 }}>
        <MpCredentialsForm
          hasAccessToken={Boolean(mp.has_access_token)}
          hasPublicKey={Boolean(mp.has_public_key)}
          readOnly={impersonating}
        />
      </div>
    </div>
  );
}
