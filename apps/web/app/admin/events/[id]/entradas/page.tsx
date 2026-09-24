import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';
import { tokensPrivados, limitesPrivados } from '@/lib/privateAccess';
import { TicketTypeEditor, NewTicketTypeForm, type TtRow } from '../editar/EditEventForms';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// ENTRADAS del evento (su propia sección desde 2026-09-23): las que existen,
// cada una en una fila que se abre para editarla y se guarda con SU botón, y
// al final "Agregar tipo de entrada". Antes vivían dentro de "Datos del evento".
export default async function EventTicketsPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();
  const impersonating = ctx.soloLectura;

  const admin = createAdminClient();
  const { data: event } = await admin.from('events').select('id, brand_id, is_free, slug, name').eq('id', params.id).maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  const { data: tts } = await admin
    .from('ticket_types')
    .select('id, name, description, price_cents, capacity, sold, is_unlimited, is_active, is_courtesy, sort_order, bulk_min_qty, bulk_discount_pct, color_hex')
    .eq('event_id', event.id)
    .order('sort_order');
  const rows: TtRow[] = (tts ?? []).map((t) => ({
    id: t.id, name: t.name, description: t.description ?? '', priceCents: t.price_cents, capacity: t.capacity ?? 0,
    sold: t.sold ?? 0, isUnlimited: t.is_unlimited, isActive: t.is_active, isCourtesy: t.is_courtesy ?? false,
    bulkMinQty: t.bulk_min_qty ?? 0, bulkDiscountPct: t.bulk_discount_pct ?? 0, colorHex: t.color_hex ?? null,
  }));
  const eventIsFree = event.is_free ?? false;
  // Link de cada entrada PRIVADA (0066). Solo el dueño lo ve: la tabla es service role.
  const [privados, limites, { data: brand }] = await Promise.all([
    tokensPrivados(admin, rows.map((r) => r.id)),
    limitesPrivados(admin, rows.map((r) => r.id)),
    admin.from('brands').select('slug').eq('id', ctx.brandId).maybeSingle(),
  ]);
  const linkDe = (id: string) => {
    const tk = privados.get(id);
    if (tk === undefined) return null;
    if (!brand?.slug || !/^[A-Z0-9]+$/.test(tk)) return '';
    return `https://${brand.slug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/${event.slug}?acceso=${tk}`;
  };

  return (
    <section id="entradas" className="a-anchor">
      <h1 className="s-h1">Entradas</h1>
      <p className="s-card__desc" style={{ marginBottom: 'var(--s-s3)' }}>
        {impersonating
          ? 'Solo lectura: los tipos de entrada se muestran tal cual.'
          : 'Toca una entrada para editarla; cada una se guarda con su propio botón. A quienes ya compraron se les respeta el precio que pagaron.'}
      </p>
      <div className="s-folds">
        {rows.length === 0 && <p className="s-empty">Este evento no tiene entradas todavía. Crea la primera abajo.</p>}
        {rows.map((t) => <TicketTypeEditor key={t.id} eventId={event.id} eventIsFree={eventIsFree} tt={t} readOnly={impersonating} linkPrivado={impersonating ? null : linkDe(t.id)} limitePrivado={limites.get(t.id) ?? null} eventName={event.name} />)}
        {!impersonating && <NewTicketTypeForm eventId={event.id} eventIsFree={eventIsFree} />}
      </div>
    </section>
  );
}
