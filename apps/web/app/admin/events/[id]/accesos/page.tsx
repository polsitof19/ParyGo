import { notFound } from 'next/navigation';
import { DoorOpen, XCircle } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { LiveRefresh } from '../LiveRefresh';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

// Resultados de ticket_scans que NO son ingreso: intentos rechazados en puerta.
const REJECT_LABELS: Record<string, string> = {
  ALREADY_USED: 'QR ya usado',
  INVALIDATED: 'Entrada anulada',
  NOT_AUTHORIZED: 'Validador sin permiso',
};

export default async function EventAccessPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, name')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  // ticket_scans no está en los tipos generados (creada en migr 0015) → cast.
  type RejectScan = { id: string; result: string; scanned_at: string; validator_user_id: string | null; ticket: { ticket_number: string; ticket_type_name: string } | { ticket_number: string; ticket_type_name: string }[] | null };
  // Tickets válidos (no anulados) + miembros (etiquetar validadores) + intentos
  // rechazados registrados en ticket_scans (los inserta validate_ticket al confirmar).
  const [{ data: tickets }, { data: members }, { data: rejects }] = await Promise.all([
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
    (admin as unknown as { from: (t: string) => any })
      .from('ticket_scans')
      .select('id, result, scanned_at, validator_user_id, ticket:tickets ( ticket_number, ticket_type_name )')
      .eq('event_id', event.id)
      .in('result', ['ALREADY_USED', 'INVALIDATED', 'NOT_AUTHORIZED'])
      .order('scanned_at', { ascending: false })
      .limit(50) as Promise<{ data: RejectScan[] | null }>,
  ]);

  const nameByUser = new Map((members ?? []).map((m) => [m.user_id, m.display_name as string | null]));
  const all = tickets ?? [];
  const inside = all.filter((t) => t.validated_at);
  const outside = all.filter((t) => !t.validated_at);
  const pct = all.length > 0 ? Math.round((inside.length / all.length) * 100) : 0;

  // Escaneados por tipo: ingresaron / válidas, ordenado por nombre de tipo.
  const byType = new Map<string, { entered: number; total: number }>();
  for (const t of all) {
    const k = t.ticket_type_name;
    const row = byType.get(k) ?? { entered: 0, total: 0 };
    row.total += 1;
    if (t.validated_at) row.entered += 1;
    byType.set(k, row);
  }
  const typeRows = [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const rejectRows = (rejects ?? []).map((r) => {
    const tk = Array.isArray(r.ticket) ? r.ticket[0] : r.ticket;
    return {
      id: r.id,
      result: r.result,
      scannedAt: r.scanned_at,
      validator: r.validator_user_id ? nameByUser.get(r.validator_user_id) ?? 'validador' : null,
      ticketNumber: tk?.ticket_number ?? null,
      typeName: tk?.ticket_type_name ?? null,
    };
  });

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

      {/* AFORO AHORA */}
      <div className="s-card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <p className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><DoorOpen className="h-3.5 w-3.5" /> Aforo ahora</p>
          <span className="s-muted" style={{ fontSize: 13 }}>{pct}% lleno</span>
        </div>
        <p style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 24, marginTop: 8 }}>
          Entraron {inside.length} de {all.length}
          <span className="s-muted" style={{ fontWeight: 600, fontSize: 15 }}> · faltan {outside.length}</span>
        </p>
        <div className="a-bar" style={{ marginTop: 12, height: 12 }}><div className="a-bar__fill" style={{ width: `${pct}%` }} /></div>
        {all.length === 0 && <p className="s-empty" style={{ marginTop: 10 }}>No hay entradas válidas todavía.</p>}
      </div>

      {/* Escaneados por tipo */}
      {typeRows.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2 className="s-h2" style={{ marginBottom: 12 }}>Escaneados por tipo</h2>
          <div className="s-card" style={{ padding: 0 }}>
            <ul className="s-stack" style={{ gap: 0, listStyle: 'none', margin: 0, padding: 0 }}>
              {typeRows.map(([name, r]) => {
                const p = r.total > 0 ? Math.round((r.entered / r.total) * 100) : 0;
                return (
                  <li key={name} style={{ padding: '12px 16px', borderTop: '1px solid var(--cream-3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                      <span style={{ fontWeight: 600 }}>{name}</span>
                      <span className="s-muted" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{r.entered} / {r.total} · {p}%</span>
                    </div>
                    <div className="a-bar"><div className="a-bar__fill" style={{ width: `${p}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

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

      {/* Intentos rechazados en puerta */}
      <section style={{ marginTop: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <XCircle className="h-4 w-4" style={{ color: 'var(--alert)' }} /> Intentos rechazados
          <span className="s-badge s-badge--alert" style={{ marginLeft: 4 }}>{rejectRows.length}</span>
        </h2>
        <p className="s-card__desc" style={{ marginBottom: 12 }}>
          QR ya usado, entrada anulada o validador sin permiso. Se registran cuando el validador confirma el ingreso en puerta;
          la previsualización de solo lectura y los QR inexistentes no se guardan, así que esto es un piso, no el total exacto.
        </p>
        {rejectRows.length === 0 ? (
          <div className="s-card"><p className="s-empty">Ningún intento rechazado registrado. 👌</p></div>
        ) : (
          <div className="s-card" style={{ padding: 0 }}>
            <ul className="s-stack" style={{ gap: 0, listStyle: 'none', margin: 0, padding: 0 }}>
              {rejectRows.map((r) => (
                <li key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--cream-3)' }}>
                  <span style={{ minWidth: 0 }}>
                    <span className="s-badge s-badge--alert">{REJECT_LABELS[r.result] ?? r.result}</span>
                    {r.ticketNumber && <span className="s-muted" style={{ fontSize: 13 }}> · {r.typeName} · {r.ticketNumber}</span>}
                  </span>
                  <span className="s-muted" style={{ fontSize: 12.5, textAlign: 'right', flexShrink: 0 }}>
                    {fmtTime(r.scannedAt)}
                    {r.validator && <><br />por {r.validator}</>}
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
