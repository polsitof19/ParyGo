import Link from 'next/link';
import { ChevronDown, Plus, ScanLine, Settings, ArrowRight } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';
import { optimizedImage } from '@/lib/imageUrl';
import { TicketRecovery } from './TicketRecovery';
import { SetupChecklist, type SetupStep } from './SetupChecklist';
import { LowBalanceNotice } from './LowBalanceNotice';
import { publicEnv } from '@/lib/env';
import { ArchiveToggle } from '@/components/manage/ArchiveToggle';
import { setEventArchivedAction } from './events/[id]/edit-actions';
import { QuickActions } from './events/[id]/QuickActions';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const user = await requireSession();
  // Marca activa: brand_admin → su marca; super admin con cookie → la marca que
  // VE en solo lectura. El layout ya gatea; esto es defensa + saber si impersona.
  const ctx = ownerBrandContext(user);
  if (!ctx) return null;
  const brandId = ctx.brandId;
  const impersonating = ctx.soloLectura;

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, slug, name, contact_email, whatsapp_e164, yape_number, yape_holder, theme_json, event_balance')
    .eq('id', brandId)
    .single();
  if (!brand) return null;

  // Eventos + lecturas agregadas (solo lectura) para el panorama del dueño:
  // Yape pendientes y ventas pagadas por evento. Antes había que abrir cada
  // evento para ver esto; acá se ve de un vistazo.
  const [{ data: events }, { data: pendingProofs }] = await Promise.all([
    supabase
      .from('events')
      .select('id, slug, name, starts_at, is_published, cover_url, archived_at')
      .eq('brand_id', brand.id)
      .order('starts_at', { ascending: false }),
    supabase
      .from('yape_proofs')
      .select('id, order:orders!yape_proofs_order_id_fkey ( event_id )')
      .eq('brand_id', brand.id)
      .eq('status', 'pending_review'),
  ]);

  const pendingByEvent = new Map<string, number>();
  for (const p of (pendingProofs ?? []) as { order: { event_id: string } | null }[]) {
    const ev = p.order?.event_id;
    if (ev) pendingByEvent.set(ev, (pendingByEvent.get(ev) ?? 0) + 1);
  }
  // Separar activos de archivados: los archivados van en su propia sección al final.
  const activeEvents = (events ?? []).filter((e) => !e.archived_at);
  const archivedEvents = (events ?? []).filter((e) => e.archived_at);
  // Publicados = solo entre los ACTIVOS. Un evento archivado no está publicado
  // para nadie (no se vende ni aparece), contarlo inflaba el número.
  const publishedCount = activeEvents.filter((e) => e.is_published).length;
  // La tarea de Yapes mira solo eventos activos: un pendiente de un evento
  // archivado no es trabajo de hoy y mandaba a una pantalla vacía.
  const activeEventIds = new Set(activeEvents.map((e) => e.id));
  let totalPending = 0;
  let pendingEventCount = 0;
  for (const [eventId, n] of pendingByEvent) {
    if (!activeEventIds.has(eventId)) continue;
    totalPending += n;
    pendingEventCount += 1;
  }

  const adminCli = createAdminClient();

  // Recuperación: órdenes PAGADAS sin tickets (red de seguridad del flujo Yape no
  // atómico). Scopeado por brand.id con service-role. Normalmente vacío.
  // Una sola lectura de órdenes pagadas de la marca sirve para DOS cosas: el cuadre
  // de ventas por evento (exacto) y la detección de órdenes sin tickets. Antes se
  // traían las pagadas dos veces (una para sumar, otra para recuperación).
  const eventNameById = new Map((events ?? []).map((e) => [e.id, e.name] as const));
  const eventIds = (events ?? []).map((e) => e.id);
  const [{ data: paidRows }, { data: ticketOrderRows }, { count: activeTypeCount }, { data: mpStatus }, { data: validTicketRows }] = await Promise.all([
    adminCli.from('orders').select('id, buyer_name, total_cents, created_at, event_id, payment_method').eq('brand_id', brand.id).eq('status', 'paid'),
    adminCli.from('tickets').select('order_id').eq('brand_id', brand.id),
    eventIds.length
      ? adminCli.from('ticket_types').select('id', { count: 'exact', head: true }).in('event_id', eventIds).eq('is_active', true)
      : Promise.resolve({ count: 0 } as { count: number | null }),
    adminCli.rpc('get_brand_mp_status', { p_brand_id: brand.id }),
    // Solo entradas válidas (no anuladas) para "Vendidas" — misma regla que el
    // Resumen del evento. ticketOrderRows (sin filtrar) sigue siendo para la
    // detección de órdenes pagadas sin tickets.
    adminCli.from('tickets').select('order_id').eq('brand_id', brand.id).is('invalidated_at', null),
  ]);
  const mpRow = Array.isArray(mpStatus) ? mpStatus[0] : null;
  const mpConfigured = Boolean(mpRow?.has_access_token && mpRow?.has_public_key);
  const paidOrderRows = (paidRows ?? []) as { id: string; buyer_name: string | null; total_cents: number | null; created_at: string; event_id: string; payment_method: string }[];

  // Ventas por evento + total (exacto, mismos montos que antes).
  const salesByEvent = new Map<string, number>();
  let totalSalesCents = 0;
  for (const o of paidOrderRows) {
    salesByEvent.set(o.event_id, (salesByEvent.get(o.event_id) ?? 0) + (o.total_cents ?? 0));
    totalSalesCents += o.total_cents ?? 0;
  }

  const ordersWithTickets = new Set((ticketOrderRows ?? []).map((t) => t.order_id as string));

  // "¿Cómo va?" a nivel marca. Vendidas = entradas de órdenes pagadas que NO son
  // cortesía (las cortesías no son venta).
  const saleOrderIds = new Set(paidOrderRows.filter((o) => o.payment_method !== 'courtesy').map((o) => o.id));
  const soldTickets = (validTicketRows ?? []).filter((t) => saleOrderIds.has(t.order_id as string)).length;
  const nowMs = Date.now();
  // Próximo evento = el publicado, no archivado, más cercano que todavía no pasó.
  const nextEvent = activeEvents
    .filter((e) => e.is_published && Date.parse(e.starts_at) > nowMs - 12 * 3600 * 1000)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] ?? null;
  const nextDays = nextEvent ? Math.ceil((Date.parse(nextEvent.starts_at) - nowMs) / 86400000) : null;
  const nextWhen = nextDays === null ? null : nextDays <= 0 ? 'hoy' : nextDays === 1 ? 'mañana' : `en ${nextDays} días`;
  const nextPublicUrl = nextEvent ? `https://${brand.slug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/${nextEvent.slug}` : null;
  const firstPendingEvent = activeEvents.find((e) => (pendingByEvent.get(e.id) ?? 0) > 0) ?? null;
  const stuckOrders = paidOrderRows
    .filter((o) => !ordersWithTickets.has(o.id))
    .map((o) => ({ id: o.id, buyerName: o.buyer_name, totalCents: o.total_cents ?? 0, createdAt: o.created_at, eventName: eventNameById.get(o.event_id) ?? 'Evento' }));

  const theme = (brand.theme_json ?? {}) as { logo_url?: string | null; primary_color?: string; secondary_color?: string };
  const balance = brand.event_balance ?? 0;
  const canCreate = balance > 0;

  // Setup guiado (Grupo B): progreso DERIVADO de los datos (no hay flag en BD).
  // Pasos = configurar cobro → crear evento → cargar entradas → publicar.
  const cobroReady = Boolean(brand.yape_number) || mpConfigured;
  const hasEvent = (events?.length ?? 0) > 0;
  const hasTickets = (activeTypeCount ?? 0) > 0;
  const firstEventId = activeEvents[0]?.id ?? (events ?? [])[0]?.id ?? null;
  const setupSteps: SetupStep[] = [
    { key: 'cobro', title: 'Configura tu cobro', desc: 'Carga tu Yape (o tus credenciales de tarjeta) para recibir los pagos.', done: cobroReady, href: '/admin/settings', cta: 'Configurar' },
    { key: 'evento', title: 'Crea tu primer evento', desc: 'Nombre, fecha y lugar. Te toma un par de minutos.', done: hasEvent, href: '/admin/events/new', cta: 'Crear' },
    { key: 'entradas', title: 'Carga tus entradas', desc: 'Define tipos de entrada, precios y cupos.', done: hasTickets, href: firstEventId ? `/admin/events/${firstEventId}/entradas` : '/admin/events/new', cta: 'Cargar' },
    { key: 'publicar', title: 'Publica tu evento', desc: 'Cuando esté listo, ponlo en vivo para empezar a vender.', done: publishedCount > 0, href: firstEventId ? `/admin/events/${firstEventId}` : '/admin/events/new', cta: 'Publicar' },
  ];

  // ORDEN (2026-09-22): lo pendiente arriba, la información abajo, lo raro
  // plegado. La plata esperando es la tarea que manda: cuando hay Yapes por
  // revisar, SU botón es el único primario y "Crear evento" pasa a texto.
  const hasDue = totalPending > 0 && !!firstPendingEvent;
  const createPrimary = !hasDue;

  return (
    <>
      <div className="s-pagehead">
        <div>
          <h1 className="s-h1">Tus eventos</h1>
          <p className="s-card__desc">
            {activeEvents.length} activo{activeEvents.length === 1 ? '' : 's'} · {publishedCount} publicado{publishedCount === 1 ? '' : 's'}
          </p>
        </div>
        {impersonating ? null : canCreate ? (
          <Link href="/admin/events/new" className={`s-btn ${createPrimary ? 's-btn--primary' : 's-btn--soft'}`}>
            <Plus className="h-4 w-4" /> Crear evento
          </Link>
        ) : (
          <button type="button" className={`s-btn ${createPrimary ? 's-btn--primary' : 's-btn--soft'}`} disabled title="Sin saldo de eventos">
            <Plus className="h-4 w-4" /> Crear evento
          </button>
        )}
      </div>

      {/* 1) PENDIENTE — la cifra héroe es lo que está esperando. */}
      {hasDue && (
        <div className="s-due" role="status">
          <div className="s-due__txt">
            <span className="s-due__k">Por revisar</span>
            <span className="s-due__n">{totalPending} Yape{totalPending === 1 ? '' : 's'}</span>
            <span className="s-due__sub">
              Plata esperando tu aprobación{pendingEventCount > 1 && ` en ${pendingEventCount} eventos`} · hay gente esperando su QR.
            </span>
          </div>
          <Link href={`/admin/events/${firstPendingEvent!.id}/yape`} className="s-btn s-btn--primary">Revisar Yapes</Link>
        </div>
      )}

      {/* Aviso de saldo bajo (solo dueño): es una tarea, va arriba. */}
      {!impersonating && (
        <LowBalanceNotice balance={balance} brandName={brand.name} supportWhatsapp={publicEnv.NEXT_PUBLIC_SUPPORT_WHATSAPP} />
      )}

      {/* Recuperación de tickets — solo aparece si hay órdenes pagadas sin tickets.
          Re-emitir es escritura → oculto en solo lectura. */}
      {stuckOrders.length > 0 && !impersonating && <TicketRecovery orders={stuckOrders} />}

      {/* Setup guiado: solo el dueño y solo si falta algún paso (se auto-oculta). */}
      {!impersonating && <SetupChecklist steps={setupSteps} brandName={brand.name} />}

      {/* 2) ¿Cómo va? — la plata primero. */}
      <div className="a-pulse a-pulse--3">
        <div className="s-stat">
          <span className="s-stat__label">Recaudado</span>
          <span className="s-stat__value">{formatPEN(totalSalesCents)}</span>
          <span className="s-stat__sub">confirmado en tus cuentas</span>
        </div>
        <div className="s-stat">
          <span className="s-stat__label">Vendidas</span>
          <span className="s-stat__value">{soldTickets}</span>
          <span className="s-stat__sub">entradas, todos tus eventos</span>
        </div>
        <div className={`s-stat${balance === 0 ? ' s-stat--alert' : ''}`}>
          <span className="s-stat__label">Eventos disponibles</span>
          <span className="s-stat__value">{balance}</span>
          <span className="s-stat__sub">{canCreate ? `puedes crear ${balance} más` : 'sin saldo — pide un pack'}</span>
        </div>
      </div>

      {/* 3) El próximo evento con sus acciones a la vista: buscar comprador,
          reenviar entrada, exportar, promotores, escáner… a UN toque de la home.
          Sin próximo evento queda el escáner, lo único que no depende de uno. */}
      {nextEvent ? (
        <section className="s-section a-next" aria-labelledby="a-next-title">
          <span className="s-acts__k">Próximo · {nextWhen}</span>
          <h2 id="a-next-title" className="s-h2 a-next__title">
            <Link href={`/admin/events/${nextEvent.id}`}>{nextEvent.name}</Link>
          </h2>
          <p className="s-card__desc">{formatPEN(salesByEvent.get(nextEvent.id) ?? 0)} vendido</p>
          <QuickActions eventId={nextEvent.id} publicUrl={nextPublicUrl} isPublished={!!nextEvent.is_published} readOnly={impersonating} label="Acciones del próximo evento" />
        </section>
      ) : (
        <p className="s-calm">
          <span style={{ flex: '1 1 220px' }}>Ningún evento publicado por venir. {canCreate ? 'Crea o publica uno para empezar a vender.' : 'Pide un pack para crear el próximo.'}</span>
          <Link href="/scan" className="s-btn s-btn--soft s-btn--sm">
            <ScanLine aria-hidden="true" /> Abrir escáner
          </Link>
        </p>
      )}

      {/* 4) Eventos activos, en filas */}
      <section className="s-section">
        <h2 className="s-h2">Todos tus eventos</h2>
        {!events || events.length === 0 ? (
          <p className="s-empty">
            {canCreate
              ? 'Todavía no creaste ningún evento. Usa “Crear evento” para arrancar.'
              : 'No tienes eventos. Cuando ParyGo te cargue saldo vas a poder crear el primero.'}
          </p>
        ) : activeEvents.length === 0 ? (
          <p className="s-empty">Todos tus eventos están archivados. Míralos en “Archivados”, más abajo.</p>
        ) : (
          <ul className="a-evlist">
            {activeEvents.map((e) => {
              const pend = pendingByEvent.get(e.id) ?? 0;
              const sales = salesByEvent.get(e.id) ?? 0;
              const start = new Date(e.starts_at);
              const past = start.getTime() < Date.now();
              const status = !e.is_published ? { cls: 's-badge--draft', label: 'Borrador' }
                : past ? { cls: 's-badge--draft', label: 'Pasado' }
                : sales > 0 ? { cls: 's-badge--ok', label: 'Vendiendo' }
                : { cls: 's-badge--ok', label: 'Publicado' };
              return (
                <li key={e.id}>
                  <Link href={`/admin/events/${e.id}`} className={`a-evrow${past ? ' a-evrow--past' : ''}`}>
                    <span className="a-evrow__thumb" aria-hidden="true">
                      {e.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={optimizedImage(e.cover_url, { width: 160, quality: 72 })} alt="" loading="lazy" decoding="async" />
                      ) : (
                        (e.name.trim()[0] ?? '?').toUpperCase()
                      )}
                    </span>
                    <span className="a-evrow__main">
                      <span className="a-evrow__title">{e.name}</span>
                      <span className="a-evrow__when">
                        {start.toLocaleString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}
                        <span className={`s-badge ${status.cls}`}>{status.label}</span>
                      </span>
                    </span>
                    <span className="a-evrow__side">
                      {sales > 0 && <span className="a-evrow__money">{formatPEN(sales)}</span>}
                      {pend > 0 && <span className="s-badge s-badge--todo">{pend} Yape</span>}
                    </span>
                    <ArrowRight className="a-evrow__go" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 5) LO RARO, PLEGADO: archivados y los datos de la marca. */}
      <div className="s-folds">
        {archivedEvents.length > 0 && (
          <details className="s-fold">
            <summary>
              <span className="s-fold__t">
                Archivados ({archivedEvents.length})
                <span className="s-fold__hint">No se venden ni aparecen en público. Puedes desarchivarlos.</span>
              </span>
              <ChevronDown aria-hidden="true" />
            </summary>
            <div className="s-fold__body">
              <ul className="s-event-list">
                {archivedEvents.map((e) => (
                  <li key={e.id} className="s-event-row">
                    <Link href={`/admin/events/${e.id}`} className="s-event-row__main">
                      <span className="s-event-row__name">{e.name}</span>
                      <span className="s-event-row__date">
                        {new Date(e.starts_at).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' })}
                      </span>
                    </Link>
                    <span className="s-badge s-badge--draft">Archivado</span>
                    {!impersonating && <ArchiveToggle id={e.id} archived={true} action={setEventArchivedAction} noun="el evento" />}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}

        <details className="s-fold">
          <summary>
            <span className="s-fold__t">
              Tu marca
              <span className="s-fold__hint">Datos públicos y de cobro de {brand.name}.</span>
            </span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="s-fold__body">
            <div className="s-grid-2">
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
            {!impersonating && (
              <Link href="/admin/settings" className="s-btn s-btn--soft s-btn--sm">
                <Settings className="h-4 w-4" /> Editar tu marca
              </Link>
            )}
          </div>
        </details>
      </div>
    </>
  );
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
