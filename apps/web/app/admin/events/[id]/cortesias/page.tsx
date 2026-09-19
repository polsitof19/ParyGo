import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { CourtesyForm } from '../editar/CourtesyForm';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Cortesías — grupo "Ventas y pagos". Antes vivía dentro de "Editar evento",
// pero emitir entradas gratis no es editar el evento (ver handoff de paneles).
// Acá: emitir + ver lo ya emitido (antes no había dónde verlo).
export default async function CourtesiesPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();
  const impersonating = ctx.impersonating;

  const admin = createAdminClient();
  const { data: event } = await admin.from('events').select('id, brand_id').eq('id', params.id).maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  const [{ data: types }, { data: orders }] = await Promise.all([
    admin.from('ticket_types').select('id, name').eq('event_id', event.id).eq('is_active', true).order('sort_order'),
    admin
      .from('orders')
      .select('id, buyer_email, created_at, email_sent_at, items:order_items ( ticket_type_name, quantity )')
      .eq('event_id', event.id)
      .eq('payment_method', 'courtesy')
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  type Row = { id: string; buyer_email: string; created_at: string; email_sent_at: string | null; items: { ticket_type_name: string | null; quantity: number | null }[] | null };
  const rows = (orders ?? []) as Row[];
  const totalIssued = rows.reduce((a, r) => a + (r.items ?? []).reduce((b, it) => b + (it.quantity ?? 0), 0), 0);

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <span className="eyebrow">Ventas y pagos</span>
        <h2 className="s-h2" style={{ marginTop: 6 }}>Cortesías</h2>
        <p className="s-card__desc">
          Entradas gratis para invitados, prensa o RR.PP. Son entradas reales, escaneables en puerta, y <strong>descuentan del aforo</strong>.
        </p>
      </div>

      {!impersonating && (
        <div className="s-card">
          <CourtesyForm eventId={event.id} ticketTypes={types ?? []} />
        </div>
      )}

      <div className="s-card s-section">
        <div className="s-card__head" style={{ marginBottom: 8 }}>
          <div>
            <h3 className="s-h3">Emitidas</h3>
            <p className="s-card__desc">{totalIssued} entrada{totalIssued === 1 ? '' : 's'} de cortesía en {rows.length} envío{rows.length === 1 ? '' : 's'}.</p>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="s-empty">Todavía no emitiste cortesías para este evento.</p>
        ) : (
          <ul className="s-hlist">
            {rows.map((r) => (
              <li key={r.id} className="s-hlist__row">
                <div className="s-event-row__main">
                  <span className="s-event-row__name">{r.buyer_email}</span>
                  <span className="s-event-row__date">
                    {(r.items ?? []).map((it) => `${it.quantity ?? 0} ${it.ticket_type_name ?? 'Entrada'}`).join(' · ')}
                    {' · '}
                    {new Date(r.created_at).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}
                  </span>
                </div>
                <span className={`s-badge ${r.email_sent_at ? 's-badge--ok' : 's-badge--draft'}`}>
                  {r.email_sent_at ? 'Email enviado' : 'Sin email'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
