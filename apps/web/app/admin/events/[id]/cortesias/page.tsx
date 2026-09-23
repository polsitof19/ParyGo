import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';
import { ticketPublicUrl } from '@/lib/qr';
import { formatEventDate } from '@/lib/utils';
import { CourtesyForm } from '../editar/CourtesyForm';
import { CopyButton, FreeCodeForm } from './CortesiasClient';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Cortesías — pestaña "Personas". Dos formas de regalar entradas:
//  1. Enviar cortesías: se emiten YA, llegan al email del organizador y él las
//     reparte una por una (link por entrada: copiar o WhatsApp).
//  2. Códigos para reclamar: un código promo 'free' con N usos; cada invitado
//     lo pone en la página pública y le llega SU entrada a SU email.
// Todo se lee server-side con el guard del evento (marca activa = dueña del
// evento). Las escrituras vuelven a decidir en sus propias acciones.
export default async function CourtesiesPage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();
  const soloLectura = ctx.soloLectura;

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, name, slug, starts_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  const [{ data: brand }, { data: types }, { data: tickets }, { data: codes }] = await Promise.all([
    admin.from('brands').select('slug').eq('id', ctx.brandId).maybeSingle(),
    admin.from('ticket_types').select('id, name').eq('event_id', event.id).eq('is_active', true).order('sort_order'),
    // Cada entrada de cortesía de ESTE evento y ESTA marca (doble filtro).
    admin
      .from('tickets')
      .select('id, qr_code, ticket_type_name, scan_count, validated_at, invalidated_at, created_at, order:orders!inner ( buyer_email, payment_method, status )')
      .eq('event_id', event.id)
      .eq('brand_id', ctx.brandId)
      .eq('order.payment_method', 'courtesy')
      .eq('order.status', 'paid')
      .order('created_at', { ascending: true })
      .order('ticket_number', { ascending: true })
      .limit(1000),
    admin
      .from('promo_codes')
      .select('id, code, max_uses, use_count, is_active')
      .eq('event_id', event.id)
      .eq('brand_id', ctx.brandId)
      .eq('discount_type', 'free')
      .order('created_at', { ascending: false }),
  ]);

  const when = event.starts_at ? formatEventDate(event.starts_at) : '';
  const eventUrl = brand?.slug ? `https://${brand.slug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/${event.slug}` : null;

  type T = {
    id: string; qr_code: string; ticket_type_name: string; scan_count: number;
    validated_at: string | null; invalidated_at: string | null;
    order: { buyer_email: string } | { buyer_email: string }[] | null;
  };
  const rows = ((tickets ?? []) as T[]).map((t, i) => {
    const o = Array.isArray(t.order) ? t.order[0] : t.order;
    const estado: 'anulada' | 'usada' | 'libre' = t.invalidated_at ? 'anulada' : t.scan_count > 0 || t.validated_at ? 'usada' : 'libre';
    const url = brand?.slug ? ticketPublicUrl(brand.slug, t.qr_code) : null;
    return { id: t.id, n: i + 1, tipo: t.ticket_type_name, email: o?.buyer_email ?? '', estado, url };
  });
  const libres = rows.filter((r) => r.estado === 'libre').length;

  return (
    <>
      <div style={{ marginBottom: 'var(--s-s2)' }}>
        <h2 className="s-h2" style={{ marginTop: 'var(--s-s1)' }}>Cortesías</h2>
        <p className="s-card__desc">
          Entradas gratis para invitados, prensa o RR.PP. Son entradas reales, escaneables en puerta, y <strong>descuentan del aforo</strong>.
        </p>
      </div>

      {!soloLectura && (
        <div className="s-card">
          <h3 className="s-h3">Enviar cortesías</h3>
          <p className="s-card__desc" style={{ marginBottom: 'var(--s-s2)' }}>
            Te llegan a ti y las reenvías una por una. Cada QR entra una sola vez.
          </p>
          <CourtesyForm eventId={event.id} ticketTypes={types ?? []} defaultEmail={user.email} />
        </div>
      )}

      <div className="s-card s-section">
        <h3 className="s-h3">Tus cortesías</h3>
        <p className="s-card__desc" style={{ marginBottom: 'var(--s-s1)' }}>
          {rows.length} emitida{rows.length === 1 ? '' : 's'} · {libres} sin usar. Manda cada link a una sola persona.
        </p>
        {rows.length === 0 ? (
          <p className="s-empty">Todavía no emitiste cortesías para este evento.</p>
        ) : (
          <ul className="s-hlist">
            {rows.map((r) => {
              const texto = r.url ? `Tu entrada para ${event.name}${when ? ` · ${when}` : ''}: ${r.url}` : '';
              return (
                <li key={r.id} className="s-hlist__row">
                  <div className="s-event-row__main">
                    <span className="s-event-row__name">Entrada {r.n}</span>
                    <span className="s-event-row__date">{r.tipo} · enviada a {r.email}</span>
                  </div>
                  <div className="a-cz-actions">
                    <span className={`a-cz-state a-cz-state--${r.estado}`}>
                      {r.estado === 'anulada' ? 'Anulada' : r.estado === 'usada' ? 'Ya entró' : 'Sin usar'}
                    </span>
                    {r.estado !== 'anulada' && r.url && (
                      <>
                        <CopyButton text={r.url} label="Copiar link" />
                        <a
                          className="s-btn s-btn--soft s-btn--sm"
                          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          WhatsApp
                        </a>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="s-card s-section">
        <h3 className="s-h3">Códigos para reclamar</h3>
        <p className="s-card__desc" style={{ marginBottom: 'var(--s-s2)' }}>
          Cada persona usa el código una vez al &ldquo;comprar&rdquo; en la página del evento y le llega su entrada por email.
        </p>
        {!soloLectura && <FreeCodeForm eventId={event.id} ticketTypes={types ?? []} />}
        {(codes ?? []).length > 0 && (
          <ul className="s-hlist" style={{ marginTop: 'var(--s-s3)' }}>
            {(codes ?? []).map((c) => {
              const msg = eventUrl
                ? `Reclama tu entrada gratis para ${event.name} en ${eventUrl} con el código ${c.code}`
                : '';
              return (
                <li key={c.id} className="s-hlist__row">
                  <div className="s-event-row__main">
                    <span className="a-code">{c.code}</span>
                    <span className="s-event-row__date">
                      {c.use_count} de {c.max_uses ?? 'sin límite'} usados{c.is_active ? '' : ' · desactivado'}
                    </span>
                  </div>
                  {c.is_active && msg && <CopyButton text={msg} label="Copiar mensaje" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
