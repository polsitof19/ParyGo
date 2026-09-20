import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScanLine } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { TeamPanel } from '../../../TeamPanel';

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

      <TeamPanel brandId={ctx.brandId} impersonating={ctx.impersonating} />
    </>
  );
}
