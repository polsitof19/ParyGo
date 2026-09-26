import Link from 'next/link';
import { ChevronLeft, ScanLine } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { TeamPanel } from '../TeamPanel';
import { textosPanel } from '@/lib/idiomaServer';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Equipo de puerta a nivel MARCA. Antes esta gestión (contraseñas, códigos,
// invitaciones) vivía en la home, compitiendo con "¿cómo va mi evento?": es
// configuración, se toca una vez y no todos los días.
export default async function AdminTeamPage() {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) return null;
  const { t } = await textosPanel();

  return (
    <div style={{ maxWidth: 680 }}>
      <Link href="/admin" className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> {t('Tus eventos', 'Your events')}
      </Link>

      <div className="s-pagehead" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="s-h1" style={{ marginTop: 8 }}>{t('Equipo de puerta', 'Door team')}</h1>
          <p className="s-card__desc">
            {t('Tu staff valida entradas con su email y contraseña, o con su código personal de puerta.', 'Your staff validates tickets with their email and password, or with their personal door code.')}
            {' '}
            {t('Solo ven el escáner, nada más de tu panel. Vale para todos tus eventos.', 'They only see the scanner, nothing else in your dashboard. It works for all your events.')}
          </p>
        </div>
        <Link href="/scan" className="s-btn s-btn--soft s-btn--sm">
          <ScanLine className="h-4 w-4" /> {t('Abrir escáner', 'Open scanner')}
        </Link>
      </div>

      <TeamPanel brandId={ctx.brandId} impersonating={ctx.soloLectura} />
    </div>
  );
}
