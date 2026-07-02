import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { TicketTypeEditor, NewTicketTypeForm, type TtRow } from '../editar/EditEventForms';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function EventTicketsEditPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();
  const impersonating = ctx.impersonating;

  const admin = createAdminClient();
  const { data: event } = await admin.from('events').select('id, brand_id').eq('id', params.id).maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  const { data: tts } = await admin
    .from('ticket_types')
    .select('id, name, description, price_cents, capacity, sold, is_unlimited, is_active, sort_order, bulk_min_qty, bulk_discount_pct')
    .eq('event_id', event.id)
    .order('sort_order');

  const rows: TtRow[] = (tts ?? []).map((t) => ({
    id: t.id, name: t.name, description: t.description ?? '', priceCents: t.price_cents, capacity: t.capacity ?? 0,
    sold: t.sold ?? 0, isUnlimited: t.is_unlimited, isActive: t.is_active,
    bulkMinQty: t.bulk_min_qty ?? 0, bulkDiscountPct: t.bulk_discount_pct ?? 0,
  }));

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <span className="eyebrow">Editar entradas</span>
        <h2 className="s-h2" style={{ marginTop: 2 }}>Tipos de entrada</h2>
        <p className="s-card__desc">
          {impersonating
            ? 'Solo lectura: los tipos de entrada se muestran tal cual, sin posibilidad de editarlos.'
            : 'El precio de los que ya compraron queda congelado. Podés subir capacidad y crear tipos nuevos.'}
        </p>
      </div>

      <div className="s-stack" style={{ gap: 10 }}>
        {rows.length === 0
          ? <div className="s-card"><p className="s-empty">Este evento no tiene tipos de entrada todavía.</p></div>
          : rows.map((t) => <div key={t.id} className="s-card"><TicketTypeEditor eventId={event.id} tt={t} readOnly={impersonating} /></div>)}
      </div>

      {!impersonating && (
        <>
          <h2 className="s-h2" style={{ margin: '24px 0 12px' }}>Nuevo tipo de entrada</h2>
          <div className="s-card"><NewTicketTypeForm eventId={event.id} /></div>
        </>
      )}
    </>
  );
}
