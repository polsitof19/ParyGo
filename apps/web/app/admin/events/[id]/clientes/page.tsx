import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ClientsTable, type ClientRow } from './ClientsTable';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function EventClientsPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) notFound();

  const admin = createAdminClient();
  // ENFORCEMENT: el evento debe ser de la marca de la sesión (brand de la sesión,
  // nunca del form). Todo lo de abajo queda scopeado a este event_id de esta marca.
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, name')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== membership.brandId) notFound();

  // Compradores = órdenes pagadas del evento, con sus entradas. Solo de esta marca.
  const { data: orders } = await admin
    .from('orders')
    .select(`
      id, buyer_name, buyer_email, buyer_phone, buyer_dni, buyer_doc_type,
      payment_method, total_cents, discount_cents, created_at,
      tickets ( id, ticket_type_name, ticket_number, invalidated_at, validated_at )
    `)
    .eq('event_id', event.id)
    .eq('status', 'paid')
    .order('created_at', { ascending: false });

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
      <Link href={`/admin/events/${event.id}`} className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> {event.name}
      </Link>
      <header className="s-pagehead">
        <div>
          <span className="eyebrow">Clientes</span>
          <h1 className="s-h1" style={{ marginTop: 4 }}>Compradores</h1>
          <p className="s-card__desc">{rows.length} comprador{rows.length === 1 ? '' : 'es'} pagados · datos privados de tu marca.</p>
        </div>
      </header>
      <ClientsTable rows={rows} eventName={event.name} />
    </>
  );
}
