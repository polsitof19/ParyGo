import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ClientsTable, type ClientRow } from './ClientsTable';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

export default async function EventClientsPage({ params, searchParams }: { params: { id: string }; searchParams: { page?: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();

  const admin = createAdminClient();
  // ENFORCEMENT: el evento debe ser de la marca activa (brand de la sesión o la
  // impersonada, nunca del form). Todo lo de abajo queda scopeado a este event_id.
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, name')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Compradores = órdenes pagadas del evento, con sus entradas. Solo de esta marca.
  // Paginado: una página de 100 + total exacto (count) para los controles.
  const { data: orders, count } = await admin
    .from('orders')
    .select(`
      id, buyer_name, buyer_email, buyer_phone, buyer_dni, buyer_doc_type,
      payment_method, total_cents, discount_cents, created_at,
      tickets ( id, ticket_type_name, ticket_number, invalidated_at, validated_at )
    `, { count: 'exact' })
    .eq('event_id', event.id)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .range(from, to);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows: ClientRow[] = (orders ?? []).map((o) => ({
    orderId: o.id,
    name: o.buyer_name,
    email: o.buyer_email,
    phone: o.buyer_phone,
    dni: o.buyer_dni ?? null,
    docType: o.buyer_doc_type ?? null,
    paymentMethod: o.payment_method,
    totalCents: o.total_cents ?? 0,
    discountCents: o.discount_cents ?? 0,
    createdAt: o.created_at,
    tickets: ((o.tickets ?? []) as { id: string; ticket_type_name: string; ticket_number: string; invalidated_at: string | null; validated_at: string | null }[]).map((t) => ({
      id: t.id,
      typeName: t.ticket_type_name,
      number: t.ticket_number,
      voided: !!t.invalidated_at,
      enteredAt: t.validated_at,
    })),
  }));

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <span className="eyebrow">Clientes</span>
        <h2 className="s-h2" style={{ marginTop: 2 }}>Compradores</h2>
        <p className="s-card__desc">
          {total} comprador{total === 1 ? '' : 'es'} pagados · datos privados de tu marca.
          {totalPages > 1 && <> · página {page} de {totalPages}</>}
        </p>
      </div>
      <ClientsTable rows={rows} eventId={event.id} eventName={event.name} impersonating={ctx.impersonating} />
      {totalPages > 1 && (
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 16 }} aria-label="Paginación de compradores">
          {page > 1 ? (
            <Link href={`/admin/events/${event.id}/clientes?page=${page - 1}`} className="s-btn s-btn--soft s-btn--sm">Anterior</Link>
          ) : (
            <button type="button" className="s-btn s-btn--soft s-btn--sm" disabled>Anterior</button>
          )}
          <span className="s-muted" style={{ fontSize: 13 }}>Página {page} de {totalPages}</span>
          {page < totalPages ? (
            <Link href={`/admin/events/${event.id}/clientes?page=${page + 1}`} className="s-btn s-btn--soft s-btn--sm">Siguiente</Link>
          ) : (
            <button type="button" className="s-btn s-btn--soft s-btn--sm" disabled>Siguiente</button>
          )}
        </nav>
      )}
    </>
  );
}
