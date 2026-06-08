import Link from 'next/link';
import { Calendar, Plus, ScanLine, Settings, ArrowRight, Bell } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';
import { InviteValidator } from './InviteValidator';
import { ValidatorManager } from './ValidatorManager';
import { TicketRecovery } from './TicketRecovery';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const user = await requireSession();
  const brandMembership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!brandMembership) return null;

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, slug, name, contact_email, whatsapp_e164, yape_number, yape_holder, theme_json, event_balance')
    .eq('id', brandMembership.brandId)
    .single();
  if (!brand) return null;

  // Eventos + lecturas agregadas (solo lectura) para el panorama del dueño:
  // Yape pendientes y ventas pagadas por evento. Antes había que abrir cada
  // evento para ver esto; acá se ve de un vistazo.
  const [{ data: events }, { data: pendingProofs }, { data: paidOrders }] = await Promise.all([
    supabase
      .from('events')
      .select('id, slug, name, starts_at, is_published')
      .eq('brand_id', brand.id)
      .order('starts_at', { ascending: false }),
    supabase
      .from('yape_proofs')
      .select('id, order:orders!yape_proofs_order_id_fkey ( event_id )')
      .eq('brand_id', brand.id)
      .eq('status', 'pending_review'),
    supabase
      .from('orders')
      .select('event_id, total_cents')
      .eq('brand_id', brand.id)
      .eq('status', 'paid'),
  ]);

  const pendingByEvent = new Map<string, number>();
  for (const p of (pendingProofs ?? []) as { order: { event_id: string } | null }[]) {
    const ev = p.order?.event_id;
    if (ev) pendingByEvent.set(ev, (pendingByEvent.get(ev) ?? 0) + 1);
  }
  const salesByEvent = new Map<string, number>();
  for (const o of (paidOrders ?? []) as { event_id: string; total_cents: number | null }[]) {
    salesByEvent.set(o.event_id, (salesByEvent.get(o.event_id) ?? 0) + (o.total_cents ?? 0));
  }
  const totalPending = (pendingProofs ?? []).length;
  const totalSalesCents = (paidOrders ?? []).reduce((a, o) => a + ((o as { total_cents: number | null }).total_cents ?? 0), 0);
  const publishedCount = (events ?? []).filter((e) => e.is_published).length;

  // Validadores de la marca + su código personal activo (service-role).
  const adminCli = createAdminClient();
  const nowIso = new Date().toISOString();
  const [{ data: members }, { data: codes }] = await Promise.all([
    adminCli.from('brand_members').select('user_id, display_name').eq('brand_id', brand.id).eq('role', 'validator'),
    adminCli.from('validator_codes').select('id, user_id, code, expires_at').eq('brand_id', brand.id).gt('expires_at', nowIso),
  ]);
  const validators = (members ?? []).map((m) => {
    const c = (codes ?? []).find((x) => x.user_id === m.user_id);
    return {
      user_id: m.user_id,
      display_name: m.display_name,
      code: c?.code ?? null,
      code_id: c?.id ?? null,
      expires_at: c?.expires_at ?? null,
    };
  });

  // Recuperación: órdenes PAGADAS sin tickets (red de seguridad del flujo Yape no
  // atómico). Scopeado por brand.id con service-role. Normalmente vacío.
  const eventNameById = new Map((events ?? []).map((e) => [e.id, e.name] as const));
  const [{ data: paidRows }, { data: ticketOrderRows }] = await Promise.all([
    adminCli.from('orders').select('id, buyer_name, total_cents, created_at, event_id').eq('brand_id', brand.id).eq('status', 'paid'),
    adminCli.from('tickets').select('order_id').eq('brand_id', brand.id),
  ]);
  const ordersWithTickets = new Set((ticketOrderRows ?? []).map((t) => t.order_id as string));
  const stuckOrders = ((paidRows ?? []) as { id: string; buyer_name: string | null; total_cents: number | null; created_at: string; event_id: string }[])
    .filter((o) => !ordersWithTickets.has(o.id))
    .map((o) => ({ id: o.id, buyerName: o.buyer_name, totalCents: o.total_cents ?? 0, createdAt: o.created_at, eventName: eventNameById.get(o.event_id) ?? 'Evento' }));

  const theme = (brand.theme_json ?? {}) as { logo_url?: string | null; primary_color?: string; secondary_color?: string };
  const balance = brand.event_balance ?? 0;
  const canCreate = balance > 0;

  return (
    <>
      <div className="s-pagehead">
        <div>
          <span className="eyebrow">{brand.name} · tu panel</span>
          <h1 className="s-h1" style={{ marginTop: 4 }}>Tus eventos</h1>
          <p className="s-card__desc">
            {events?.length ?? 0} evento{events?.length === 1 ? '' : 's'} · {publishedCount} publicado{publishedCount === 1 ? '' : 's'}
            {totalPending > 0 && <> · <span style={{ color: 'var(--alert)' }}>{totalPending} Yape por revisar</span></>}
          </p>
        </div>
        {canCreate ? (
          <Link href="/admin/events/new" className="s-btn s-btn--primary">
            <Plus className="h-4 w-4" /> Crear evento
          </Link>
        ) : (
          <button type="button" className="s-btn s-btn--primary" disabled title="Sin saldo de eventos">
            <Plus className="h-4 w-4" /> Crear evento
          </button>
        )}
      </div>

      {/* Panorama: lo que importa cada día — saldo, publicados, Yape esperando, ventas */}
      <div className="s-stats-4" style={{ marginBottom: 22 }}>
        <div className="s-stat">
          <span className="s-stat__label">Saldo de eventos</span>
          <span className="s-stat__value">{balance}</span>
          <span className="s-stat__sub">{canCreate ? 'podés crear más' : 'sin saldo — pedí un pack'}</span>
        </div>
        <div className="s-stat">
          <span className="s-stat__label">Eventos publicados</span>
          <span className="s-stat__value">{publishedCount}</span>
          <span className="s-stat__sub">de {events?.length ?? 0} en total</span>
        </div>
        <Link href={firstPendingEventHref(events, pendingByEvent)} className={`s-stat${totalPending > 0 ? ' s-stat--alert' : ''}`} style={{ textDecoration: 'none' }}>
          <span className="s-stat__label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Bell className="h-3 w-3" /> Yape por revisar
          </span>
          <span className="s-stat__value">{totalPending}</span>
          <span className="s-stat__sub">{totalPending > 0 ? 'plata esperando aprobación' : 'todo al día'}</span>
        </Link>
        <div className="s-stat">
          <span className="s-stat__label">Ventas pagadas</span>
          <span className="s-stat__value" style={{ fontSize: 26 }}>{formatPEN(totalSalesCents)}</span>
          <span className="s-stat__sub">acumulado de la marca</span>
        </div>
      </div>

      {/* Recuperación de tickets — solo aparece si hay órdenes pagadas sin tickets */}
      {stuckOrders.length > 0 && <TicketRecovery orders={stuckOrders} />}

      {/* Eventos */}
      {!events || events.length === 0 ? (
        <div className="s-card">
          <p className="s-empty">
            {canCreate
              ? 'Todavía no creaste ningún evento. Usá “Crear evento” para arrancar.'
              : 'No tenés eventos. Cuando ParyGo te cargue saldo vas a poder crear el primero.'}
          </p>
        </div>
      ) : (
        <ul className="s-stack" style={{ gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
          {events.map((e) => {
            const pend = pendingByEvent.get(e.id) ?? 0;
            const sales = salesByEvent.get(e.id) ?? 0;
            return (
              <li key={e.id}>
                <Link href={`/admin/events/${e.id}`} className="a-evrow">
                  <span className="a-evrow__id">
                    <span className="a-evrow__name">{e.name}</span>
                    <span className="a-evrow__date">
                      <Calendar className="h-3 w-3" />
                      {new Date(e.starts_at).toLocaleString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      <span className={`s-badge ${e.is_published ? 's-badge--ok' : 's-badge--draft'}`} style={{ marginLeft: 4 }}>
                        {e.is_published ? 'Publicado' : 'Borrador'}
                      </span>
                    </span>
                  </span>
                  <span className="a-evrow__stats">
                    <span className="a-evstat">
                      <span className="a-evstat__v">{formatPEN(sales)}</span>
                      <span className="a-evstat__l">Ventas</span>
                    </span>
                    <span className={`a-evstat${pend > 0 ? ' a-evstat--alert' : ''}`}>
                      <span className="a-evstat__v">{pend}</span>
                      <span className="a-evstat__l">Yape</span>
                    </span>
                  </span>
                  <span className="a-evrow__go"><ArrowRight className="h-4 w-4" /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Configuración de la marca (resumen) */}
      <div className="s-card" style={{ marginTop: 22 }}>
        <div className="s-card__head">
          <div>
            <h2 className="s-h2">Tu marca</h2>
            <p className="s-card__desc">Datos públicos y de cobro de {brand.name}.</p>
          </div>
          <Link href="/admin/settings" className="s-btn s-btn--soft s-btn--sm">
            <Settings className="h-4 w-4" /> Editar
          </Link>
        </div>
        <div className="s-grid-2" style={{ marginTop: 6 }}>
          <dl className="s-deflist">
            <Row label="Email">{brand.contact_email ?? '—'}</Row>
            <Row label="WhatsApp">{brand.whatsapp_e164 ?? '—'}</Row>
          </dl>
          <dl className="s-deflist">
            <Row label="Yape número">{brand.yape_number ?? '—'}</Row>
            <Row label="Yape titular">{brand.yape_holder ?? '—'}</Row>
            <Row label="Colores">
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <Swatch hex={theme.primary_color} />
                <Swatch hex={theme.secondary_color} />
              </span>
            </Row>
          </dl>
        </div>
      </div>

      {/* Staff de puerta */}
      <div className="s-card" style={{ marginTop: 14 }}>
        <div className="s-card__head">
          <div>
            <h2 className="s-h2">Staff de puerta</h2>
            <p className="s-card__desc">Invitá a tu staff a validar entradas. Solo ven el escáner, nada más de tu panel.</p>
          </div>
          <Link href="/scan" className="s-btn s-btn--peri s-btn--sm">
            <ScanLine className="h-4 w-4" /> Abrir escáner
          </Link>
        </div>
        <div style={{ marginTop: 14 }}>
          <p className="eyebrow" style={{ marginBottom: 10 }}>Tus validadores · contraseña + código personal de puerta</p>
          <ValidatorManager validators={validators} />
        </div>
        <div className="s-divider" />
        <p className="eyebrow" style={{ marginBottom: 10 }}>Invitar nuevo validador (por email)</p>
        <InviteValidator />
      </div>
    </>
  );
}

// Lleva el clic del KPI de Yape al primer evento con pendientes (atajo útil).
function firstPendingEventHref(
  events: { id: string }[] | null,
  pendingByEvent: Map<string, number>
): string {
  const ev = (events ?? []).find((e) => (pendingByEvent.get(e.id) ?? 0) > 0);
  return ev ? `/admin/events/${ev.id}` : '/admin';
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="s-defrow">
      <dt className="s-defrow__k">{label}</dt>
      <dd className="s-defrow__v">{children}</dd>
    </div>
  );
}

function Swatch({ hex }: { hex?: string }) {
  if (!hex) return <span className="s-muted-3">—</span>;
  return <span className="a-swatch" style={{ background: hex }} title={hex} />;
}
