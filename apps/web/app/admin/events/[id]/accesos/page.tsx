import { notFound } from 'next/navigation';
import { DoorOpen } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { LiveRefresh } from '../LiveRefresh';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

export default async function EventAccessPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) notFound();

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, name')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== membership.brandId) notFound();

  // Tickets válidos (no anulados) del evento + miembros para etiquetar validadores.
  const [{ data: tickets }, { data: members }] = await Promise.all([
    admin
      .from('tickets')
      .select('id, ticket_number, ticket_type_name, attendee_name, validated_at, validated_by')
      .eq('event_id', event.id)
      .is('invalidated_at', null)
      .order('validated_at', { ascending: false, nullsFirst: false }),
    admin
      .from('brand_members')
      .select('user_id, display_name')
      .eq('brand_id', event.brand_id),
  ]);

  const nameByUser = new Map((members ?? []).map((m) => [m.user_id, m.display_name as string | null]));
  const all = tickets ?? [];
  const inside = all.filter((t) => t.validated_at);
  const outside = all.filter((t) => !t.validated_at);
  const pct = all.length > 0 ? Math.round((inside.length / all.length) * 100) : 0;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <span className="eyebrow">Puerta</span>
          <h2 className="s-h2" style={{ marginTop: 2 }}>Accesos en vivo</h2>
          <p className="s-card__desc">Quién ya ingresó y quién falta. Solo entradas válidas (no anuladas).</p>
        </div>
        <LiveRefresh seconds={12} />
      </div>

      <div className="s-stats-4" style={{ marginBottom: 18 }}>
        <div className="s-stat">
          <span className="s-stat__label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><DoorOpen className="h-3 w-3" /> Adentro</span>
          <span className="s-stat__value">{inside.length}</span>
          <span className="s-stat__sub">de {all.length} válidas</span>
        </div>
        <div className="s-stat">
          <span className="s-stat__label">Aforo</span>
          <span className="s-stat__value">{pct}%</span>
          <span className="s-stat__sub">ingresaron</span>
        </div>
        <div className="s-stat">
          <span className="s-stat__label">Falta ingresar</span>
          <span className="s-stat__value">{outside.length}</span>
          <span className="s-stat__sub">entradas sin usar</span>
        </div>
        <div className="s-stat">
          <span className="s-stat__label">Entradas válidas</span>
          <span className="s-stat__value">{all.length}</span>
          <span className="s-stat__sub">emitidas no anuladas</span>
        </div>
      </div>

      <section>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Adentro <span className="s-badge s-badge--ok" style={{ marginLeft: 8 }}>{inside.length}</span></h2>
        {inside.length === 0 ? (
          <div className="s-card"><p className="s-empty">Todavía no ingresó nadie.</p></div>
        ) : (
          <div className="s-card" style={{ padding: 0 }}>
            <ul className="s-stack" style={{ gap: 0, listStyle: 'none', margin: 0, padding: 0 }}>
              {inside.map((t) => (
                <li key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--cream-3)' }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{t.attendee_name ?? '—'}</span>
                    <span className="s-muted" style={{ fontSize: 13 }}> · {t.ticket_type_name} · {t.ticket_number}</span>
                  </span>
                  <span className="s-muted" style={{ fontSize: 12.5, textAlign: 'right', flexShrink: 0 }}>
                    {t.validated_at && fmtTime(t.validated_at)}
                    {t.validated_by && <><br />por {nameByUser.get(t.validated_by) ?? 'validador'}</>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>Falta ingresar <span className="s-badge s-badge--draft" style={{ marginLeft: 8 }}>{outside.length}</span></h2>
        {outside.length === 0 ? (
          <div className="s-card"><p className="s-empty">{all.length === 0 ? 'No hay entradas válidas todavía.' : 'Todos los que tienen entrada ya ingresaron. 🎉'}</p></div>
        ) : (
          <div className="s-card" style={{ padding: 0 }}>
            <ul className="s-stack" style={{ gap: 0, listStyle: 'none', margin: 0, padding: 0 }}>
              {outside.map((t) => (
                <li key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--cream-3)' }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{t.attendee_name ?? '—'}</span>
                    <span className="s-muted" style={{ fontSize: 13 }}> · {t.ticket_type_name} · {t.ticket_number}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
