import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScanLine } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ValidatorManager } from '../../../ValidatorManager';
import { InviteValidator } from '../../../InviteValidator';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Equipo de puerta — grupo "Puerta y equipo". Antes la gestión de validadores
// vivía SOLO en la home global, lejos del monitor de puerta del evento (ver
// handoff de paneles). Los validadores son de la MARCA (valen para todos los
// eventos); esta página los acerca a donde se usan.
export default async function EventTeamPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();

  const admin = createAdminClient();
  const { data: event } = await admin.from('events').select('id, brand_id').eq('id', params.id).maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  const nowIso = new Date().toISOString();
  const [{ data: members }, { data: codes }] = await Promise.all([
    admin.from('brand_members').select('user_id, display_name').eq('brand_id', ctx.brandId).eq('role', 'validator'),
    admin.from('validator_codes').select('id, user_id, code, expires_at').eq('brand_id', ctx.brandId).gt('expires_at', nowIso),
  ]);
  const validators = (members ?? []).map((m) => {
    const c = (codes ?? []).find((x) => x.user_id === m.user_id);
    return { user_id: m.user_id, display_name: m.display_name, code: c?.code ?? null, code_id: c?.id ?? null, expires_at: c?.expires_at ?? null };
  });

  return (
    <>
      <div className="s-pagehead" style={{ marginBottom: 14 }}>
        <div>
          <span className="eyebrow">Puerta y equipo</span>
          <h2 className="s-h2" style={{ marginTop: 6 }}>Equipo de puerta</h2>
          <p className="s-card__desc">
            Tu staff valida entradas con su email y contraseña, o con su código personal de puerta. Solo ven el escáner, nada más de tu panel.
            Vale para todos tus eventos.
          </p>
        </div>
        <Link href="/scan" className="s-btn s-btn--soft s-btn--sm">
          <ScanLine className="h-4 w-4" /> Abrir escáner
        </Link>
      </div>

      {ctx.impersonating ? (
        <p className="s-banner" role="status">Solo lectura — la gestión del equipo no está disponible desde aquí.</p>
      ) : (
        <div className="s-card">
          <p className="s-section-lead">Tus validadores · contraseña + código personal</p>
          <ValidatorManager validators={validators} />
          <div className="s-divider" />
          <p className="s-section-lead">Invitar nuevo validador (por email)</p>
          <InviteValidator />
        </div>
      )}
    </>
  );
}
