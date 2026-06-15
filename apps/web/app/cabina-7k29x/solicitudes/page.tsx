import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { RejectButton } from './RejectButton';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type Req = {
  id: string;
  brand_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  event_info: string | null;
  status: string;
  created_at: string;
  brand_id: string | null;
};

const fmt = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

export default async function SolicitudesPage() {
  await requireSession({ superAdmin: true });
  const admin = createAdminClient();
  // Service role: la cola es solo para el super admin (RLS deny-by-default).
  const { data } = await admin
    .from('access_requests')
    .select('id, brand_name, contact_name, contact_email, contact_phone, event_info, status, created_at, brand_id')
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Req[];
  const pending = rows.filter((r) => r.status === 'pending');
  const resolved = rows.filter((r) => r.status !== 'pending');

  return (
    <>
      <header className="s-pagehead">
        <div>
          <span className="eyebrow">Onboarding</span>
          <h1 className="s-h1" style={{ marginTop: 4 }}>Solicitudes de acceso</h1>
          <p className="s-card__desc">
            {pending.length} pendiente{pending.length === 1 ? '' : 's'}. Aprobar crea la marca con el alta de siempre (vos ponés subdominio y contraseña). El saldo se carga aparte.
          </p>
        </div>
      </header>

      {pending.length === 0 ? (
        <div className="s-card"><p className="s-empty">No hay solicitudes pendientes.</p></div>
      ) : (
        <div className="s-stack" style={{ gap: 10 }}>
          {pending.map((r) => (
            <div key={r.id} className="s-card" style={{ padding: '14px 16px' }}>
              <div className="s-card__head" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 800, fontSize: 16 }}>{r.brand_name}</p>
                  <p className="s-muted" style={{ fontSize: 13, wordBreak: 'break-word' }}>
                    {r.contact_name} · {r.contact_email}{r.contact_phone ? ` · ${r.contact_phone}` : ''}
                  </p>
                  <p className="s-muted" style={{ fontSize: 12.5 }}>Recibida {fmt(r.created_at)}</p>
                </div>
                <span className="s-badge s-badge--draft" style={{ whiteSpace: 'nowrap' }}>Pendiente</span>
              </div>
              {r.event_info && <p style={{ fontSize: 14, marginTop: 8, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{r.event_info}</p>}
              <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <Link
                  href={`/cabina-7k29x/brands/new?request=${r.id}&name=${encodeURIComponent(r.brand_name)}&email=${encodeURIComponent(r.contact_email)}`}
                  className="s-btn s-btn--primary s-btn--sm"
                >
                  Aprobar y crear marca
                </Link>
                <RejectButton requestId={r.id} />
              </div>
            </div>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="s-card" style={{ marginTop: 22 }}>
          <h2 className="s-h2">Historial</h2>
          <ul className="s-event-list" style={{ marginTop: 8 }}>
            {resolved.map((r) => (
              <li key={r.id} className="s-event-row">
                <div className="s-event-row__main" style={{ cursor: 'default' }}>
                  <span className="s-event-row__name">{r.brand_name}</span>
                  <span className="s-event-row__date">{r.contact_email} · {fmt(r.created_at)}</span>
                </div>
                <span className={`s-badge ${r.status === 'approved' ? 's-badge--ok' : 's-badge--alert'}`}>
                  {r.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
