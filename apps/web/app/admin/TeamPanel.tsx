import { createAdminClient } from '@/lib/supabase/admin';
import { ValidatorManager } from './ValidatorManager';
import { InviteValidator } from './InviteValidator';
import { textosPanel } from '@/lib/idiomaServer';

// Equipo de puerta de la MARCA (los validadores valen para todos los eventos).
// Se usa desde Configuración → Equipo y desde el grupo "Puerta y equipo" de cada
// evento; la lectura de validadores + códigos vive acá una sola vez.
export async function TeamPanel({ brandId, impersonating }: { brandId: string; impersonating: boolean }) {
  const { t } = await textosPanel();
  if (impersonating) {
    return <p className="s-banner" role="status">{t('Solo lectura — la gestión del equipo no está disponible desde aquí.', 'Read only — team management is not available from here.')}</p>;
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const [{ data: members }, { data: codes }] = await Promise.all([
    admin.from('brand_members').select('user_id, display_name').eq('brand_id', brandId).eq('role', 'validator'),
    admin.from('validator_codes').select('id, user_id, code, expires_at').eq('brand_id', brandId).gt('expires_at', nowIso),
  ]);
  const validators = (members ?? []).map((m) => {
    const c = (codes ?? []).find((x) => x.user_id === m.user_id);
    return {
      user_id: m.user_id,
      display_name: m.display_name,
      code: c?.code ?? null,
      code_id: c?.id ?? null,
      expires_at: c?.expires_at ?? null,
    };
  });

  return (
    <div className="s-card">
      <p className="s-section-lead">{t('Tus validadores · contraseña + código personal', 'Your door staff · password + personal code')}</p>
      <ValidatorManager validators={validators} />
      <div className="s-divider" />
      <p className="s-section-lead">{t('Invitar nuevo validador (por email)', 'Invite new door staff (by email)')}</p>
      <InviteValidator />
    </div>
  );
}
