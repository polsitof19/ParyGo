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
          <h1 className="s-h1">Solicitudes de acceso</h1>
          <p className="s-card__desc">
            {pending.length} pendiente{pending.length === 1 ? '' : 's'}. Aprobar crea la marca con el alta de siempre (vos ponés subdominio y contraseña). El saldo se carga aparte.
          </p>
        </div>
      </header>

      {pending.length === 0 ? (
        <div className="s-card"><p className="s-empty">No hay solicitudes pendientes.</p></div>
      ) : (
        <div className="s-stack s-stack--tight">
          {pending.map((r) => (
            <div key={r.id} className="s-card s-req">
              <div className="s-card__head" style={{ marginBottom: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <p className="s-req__name">{r.brand_name}</p>
                  <p className="s-req__meta">
                    {r.contact_name} · {r.contact_email}{r.contact_phone ? ` · ${r.contact_phone}` : ''}
                  </p>
                  <p className="s-req__meta">Recibida {fmt(r.created_at)}</p>
                </div>
                {/* Pendiente = hay algo que hacer: punto de acento. */}
                <span className="s-badge s-badge--todo">Pendiente</span>
              </div>
              {r.event_info && <p className="s-req__note">{r.event_info}</p>}
              <div className="s-req__actions">
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
        <div className="s-card s-section">
          <h2 className="s-h2" style={{ marginBottom: 8 }}>Historial</h2>
          <ul className="s-hlist">
            {resolved.map((r) => (
              <li key={r.id} className="s-hlist__row">
                <div className="s-event-row__main">
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
