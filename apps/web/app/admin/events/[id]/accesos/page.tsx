import { notFound } from 'next/navigation';
import { DoorOpen, XCircle } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { todas } from '@/lib/todas';
import { textosPanel } from '@/lib/idiomaServer';
import type { Textos } from '@/lib/idioma';
import { LiveRefresh } from '../LiveRefresh';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Resultados de ticket_scans que NO son ingreso: intentos rechazados en puerta.
function rejectLabels(t: Textos['t']): Record<string, string> {
  return {
    ALREADY_USED: t('QR ya usado', 'QR already used'),
    INVALIDATED: t('Entrada anulada', 'Ticket voided'),
    NOT_AUTHORIZED: t('Validador sin permiso', 'Door staff without permission'),
  };
}

export default async function EventAccessPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();
  const { t, loc } = await textosPanel();
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });
  const REJECT_LABELS = rejectLabels(t);

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, name')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  // ticket_scans no está en los tipos generados (creada en migr 0015) → cast.
  type RejectScan = { id: string; result: string; scanned_at: string; validator_user_id: string | null; ticket: { ticket_number: string; ticket_type_name: string } | { ticket_number: string; ticket_type_name: string }[] | null };

  // Conteos por SQL (head:true, sin traer filas) + tipos del evento + miembros
  // (etiquetar validadores) + listas COMPLETAS (paginadas) + intentos rechazados.
  // AFORO: total válidos (invalidated_at null) y entraron (validated_at not null).
  const [
    { count: totalCount },
    { count: insideCount },
    { data: ticketTypes },
    { data: members },
    { data: insideList },
    { data: outsideList },
    { data: rejects },
  ] = await Promise.all([
    admin.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', event.id).is('invalidated_at', null),
    admin.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', event.id).is('invalidated_at', null).not('validated_at', 'is', null),
    admin.from('ticket_types').select('id, name').eq('event_id', event.id),
    admin.from('brand_members').select('user_id, display_name').eq('brand_id', event.brand_id),
    todas((a, b) => admin
      .from('tickets')
      .select('id, ticket_number, ticket_type_name, attendee_name, validated_at, validated_by')
      .eq('event_id', event.id)
      .is('invalidated_at', null)
      .not('validated_at', 'is', null)
      .order('validated_at', { ascending: false })
      .order('id')
      .range(a, b)).then((data) => ({ data })),
    todas((a, b) => admin
      .from('tickets')
      .select('id, ticket_number, ticket_type_name, attendee_name, validated_at, validated_by')
      .eq('event_id', event.id)
      .is('invalidated_at', null)
      .is('validated_at', null)
      .order('ticket_number', { ascending: true })
      .order('id')
      .range(a, b)).then((data) => ({ data })),
    todas<RejectScan>((a, b) => (admin as unknown as { from: (t: string) => any })
      .from('ticket_scans')
      .select('id, result, scanned_at, validator_user_id, ticket:tickets ( ticket_number, ticket_type_name )')
      .eq('event_id', event.id)
      .in('result', ['ALREADY_USED', 'INVALIDATED', 'NOT_AUTHORIZED'])
      .order('scanned_at', { ascending: false })
      .order('id')
      .range(a, b)).then((data) => ({ data })),
  ]);

  const nameByUser = new Map((members ?? []).map((m) => [m.user_id, m.display_name as string | null]));
  const totalValid = totalCount ?? 0;
  const enteredTotal = insideCount ?? 0;
  const outsideTotal = totalValid - enteredTotal;
  const inside = insideList ?? [];
  const outside = outsideList ?? [];
  const pct = totalValid > 0 ? Math.round((enteredTotal / totalValid) * 100) : 0;

  // Escaneados por tipo (exacto, por COUNT por tipo — pocos tipos): total válidos
  // (invalidated_at null) y entraron (validated_at not null) por tipo.
  const types = ticketTypes ?? [];
  const typeCounts = await Promise.all(
    types.map(async (t) => {
      const [{ count: total }, { count: entered }] = await Promise.all([
        admin.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', event.id).eq('ticket_type_id', t.id).is('invalidated_at', null),
        admin.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', event.id).eq('ticket_type_id', t.id).is('invalidated_at', null).not('validated_at', 'is', null),
      ]);
      return { name: t.name as string, entered: entered ?? 0, total: total ?? 0 };
    })
  );
  // Solo tipos con al menos una entrada válida (igual que antes, que agrupaba por
  // tickets existentes), ordenado por nombre de tipo.
  const typeRows: [string, { entered: number; total: number }][] = typeCounts
    .filter((r) => r.total > 0)
    .map((r) => [r.name, { entered: r.entered, total: r.total }] as [string, { entered: number; total: number }])
    .sort((a, b) => a[0].localeCompare(b[0]));

  const rejectRows = (rejects ?? []).map((r) => {
    const tk = Array.isArray(r.ticket) ? r.ticket[0] : r.ticket;
    return {
      id: r.id,
      result: r.result,
      scannedAt: r.scanned_at,
      validator: r.validator_user_id ? nameByUser.get(r.validator_user_id) ?? t('validador', 'door staff') : null,
      ticketNumber: tk?.ticket_number ?? null,
      typeName: tk?.ticket_type_name ?? null,
    };
  });

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 className="s-h2" style={{ marginTop: 6 }}>{t('Control de puerta en vivo', 'Live door control')}</h2>
          <p className="s-card__desc">{t('Quién ya ingresó y quién falta. Solo entradas válidas (no anuladas).', 'Who already checked in and who is missing. Valid tickets only (not voided).')}</p>
        </div>
        <LiveRefresh seconds={25} />
      </div>

      {/* AFORO AHORA */}
      <div className="s-card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <p className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><DoorOpen className="h-3.5 w-3.5" /> {t('Aforo ahora', 'Capacity now')}</p>
          <span className="s-muted" style={{ fontSize: 13 }}>{t(`${pct}% lleno`, `${pct}% full`)}</span>
        </div>
        <p style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 24, marginTop: 8 }}>
          {t(`Entraron ${enteredTotal} de ${totalValid}`, `${enteredTotal} of ${totalValid} checked in`)}
          <span className="s-muted" style={{ fontWeight: 600, fontSize: 15 }}> {t(`· faltan ${outsideTotal}`, `· ${outsideTotal} missing`)}</span>
        </p>
        <div className="a-bar" style={{ marginTop: 12, height: 12 }}><div className="a-bar__fill" style={{ width: `${pct}%` }} /></div>
        {totalValid === 0 && <p className="s-empty" style={{ marginTop: 10 }}>{t('No hay entradas válidas todavía.', 'No valid tickets yet.')}</p>}
      </div>

      {/* Escaneados por tipo */}
      {typeRows.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2 className="s-h2" style={{ marginBottom: 12 }}>{t('Escaneados por tipo', 'Scanned by type')}</h2>
          <div className="s-card" style={{ padding: 0 }}>
            <ul className="s-stack" style={{ gap: 0, listStyle: 'none', margin: 0, padding: 0 }}>
              {typeRows.map(([name, r]) => {
                const p = r.total > 0 ? Math.round((r.entered / r.total) * 100) : 0;
                return (
                  <li key={name} style={{ padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
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
        <h2 className="s-h2" style={{ marginBottom: 12 }}>{t('Adentro', 'Inside')} <span className="s-badge s-badge--ok" style={{ marginLeft: 8 }}>{enteredTotal}</span></h2>
        {enteredTotal === 0 ? (
          <div className="s-card"><p className="s-empty">{t('Todavía no ingresó nadie.', 'No one has checked in yet.')}</p></div>
        ) : (
          <div className="s-card" style={{ padding: 0 }}>
            {enteredTotal > inside.length && (
              <p className="s-muted" style={{ fontSize: 12.5, padding: '10px 16px 0' }}>{t(`Mostrando los primeros ${inside.length} de ${enteredTotal}.`, `Showing the first ${inside.length} of ${enteredTotal}.`)}</p>
            )}
            <ul className="s-stack" style={{ gap: 0, listStyle: 'none', margin: 0, padding: 0 }}>
              {inside.map((tk) => (
                <li key={tk.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{tk.attendee_name ?? '—'}</span>
                    <span className="s-muted" style={{ fontSize: 13 }}> · {tk.ticket_type_name} · {tk.ticket_number}</span>
                  </span>
                  <span className="s-muted" style={{ fontSize: 12.5, textAlign: 'right', flexShrink: 0 }}>
                    {tk.validated_at && fmtTime(tk.validated_at)}
                    {tk.validated_by && <><br />{t('por', 'by')} {nameByUser.get(tk.validated_by) ?? t('validador', 'door staff')}</>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 className="s-h2" style={{ marginBottom: 12 }}>{t('Falta ingresar', 'Not checked in')} <span className="s-badge s-badge--draft" style={{ marginLeft: 8 }}>{outsideTotal}</span></h2>
        {outsideTotal === 0 ? (
          <div className="s-card"><p className="s-empty">{totalValid === 0 ? t('No hay entradas válidas todavía.', 'No valid tickets yet.') : t('Todos los que tienen entrada ya ingresaron.', 'Everyone with a ticket has already checked in.')}</p></div>
        ) : (
          <div className="s-card" style={{ padding: 0 }}>
            {outsideTotal > outside.length && (
              <p className="s-muted" style={{ fontSize: 12.5, padding: '10px 16px 0' }}>{t(`Mostrando los primeros ${outside.length} de ${outsideTotal}.`, `Showing the first ${outside.length} of ${outsideTotal}.`)}</p>
            )}
            <ul className="s-stack" style={{ gap: 0, listStyle: 'none', margin: 0, padding: 0 }}>
              {outside.map((tk) => (
                <li key={tk.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{tk.attendee_name ?? '—'}</span>
                    <span className="s-muted" style={{ fontSize: 13 }}> · {tk.ticket_type_name} · {tk.ticket_number}</span>
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
          <XCircle className="h-4 w-4" style={{ color: 'var(--ink-2)' }} /> {t('Intentos rechazados', 'Rejected attempts')}
          <span className="s-badge s-badge--alert" style={{ marginLeft: 4 }}>{rejectRows.length}</span>
        </h2>
        <p className="s-card__desc" style={{ marginBottom: 12 }}>
          {t(
            'QR ya usado, entrada anulada o validador sin permiso. Se registran cuando el validador confirma el ingreso en puerta; la previsualización de solo lectura y los QR inexistentes no se guardan, así que esto es un piso, no el total exacto.',
            'QR already used, voided ticket, or door staff without permission. These are logged when the door staff confirms entry; the read-only preview and nonexistent QR codes are not saved, so this is a floor, not the exact total.'
          )}
        </p>
        {rejectRows.length === 0 ? (
          <div className="s-card"><p className="s-empty">{t('Ningún intento rechazado registrado.', 'No rejected attempts logged.')}</p></div>
        ) : (
          <div className="s-card" style={{ padding: 0 }}>
            <ul className="s-stack" style={{ gap: 0, listStyle: 'none', margin: 0, padding: 0 }}>
              {rejectRows.map((r) => (
                <li key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
                  <span style={{ minWidth: 0 }}>
                    <span className="s-badge s-badge--alert">{REJECT_LABELS[r.result] ?? r.result}</span>
                    {r.ticketNumber && <span className="s-muted" style={{ fontSize: 13 }}> · {r.typeName} · {r.ticketNumber}</span>}
                  </span>
                  <span className="s-muted" style={{ fontSize: 12.5, textAlign: 'right', flexShrink: 0 }}>
                    {fmtTime(r.scannedAt)}
                    {r.validator && <><br />{t('por', 'by')} {r.validator}</>}
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
