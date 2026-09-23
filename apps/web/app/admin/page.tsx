import Link from 'next/link';
import { ChevronDown, Plus } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { optimizedImage } from '@/lib/imageUrl';
import { TicketRecovery } from './TicketRecovery';
import { SetupChecklist, type SetupStep } from './SetupChecklist';
import { LowBalanceNotice } from './LowBalanceNotice';
import { publicEnv } from '@/lib/env';
import { ArchiveToggle } from '@/components/manage/ArchiveToggle';
import { setEventArchivedAction } from './events/[id]/edit-actions';

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
    .select('id, slug, name, yape_number, event_balance')
    .eq('id', brandId)
    .single();
  if (!brand) return null;

  // Eventos + lecturas agregadas (solo lectura) para el panorama del dueño:
  // Yape pendientes y ventas pagadas por evento. Antes había que abrir cada
  // evento para ver esto; acá se ve de un vistazo.
  const [{ data: events }, { data: pendingProofs }] = await Promise.all([
    supabase
      .from('events')
      .select('id, slug, name, starts_at, is_published, cover_url, archived_at, venue_name')
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

  // Ventas por evento (exacto, mismos montos que antes).
  const salesByEvent = new Map<string, number>();
  for (const o of paidOrderRows) {
    salesByEvent.set(o.event_id, (salesByEvent.get(o.event_id) ?? 0) + (o.total_cents ?? 0));
  }

  const ordersWithTickets = new Set((ticketOrderRows ?? []).map((t) => t.order_id as string));

  // "¿Cómo va?" a nivel marca. Vendidas = entradas de órdenes pagadas que NO son
  // cortesía (las cortesías no son venta).
  const saleOrderIds = new Set(paidOrderRows.filter((o) => o.payment_method !== 'courtesy').map((o) => o.id));
  // Vendidas por evento (misma regla: válidas y no cortesía), para la lista.
  const eventoDeOrden = new Map(paidOrderRows.map((o) => [o.id, o.event_id] as const));
  const soldByEvent = new Map<string, number>();
  for (const t of (validTicketRows ?? []) as { order_id: string }[]) {
    if (!saleOrderIds.has(t.order_id)) continue;
    const ev = eventoDeOrden.get(t.order_id);
    if (ev) soldByEvent.set(ev, (soldByEvent.get(ev) ?? 0) + 1);
  }
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
    { key: 'entradas', title: 'Carga tus entradas', desc: 'Define tipos de entrada, precios y cupos.', done: hasTickets, href: firstEventId ? `/admin/events/${firstEventId}/editar#entradas` : '/admin/events/new', cta: 'Cargar' },
    { key: 'publicar', title: 'Publica tu evento', desc: 'Cuando esté listo, ponlo en vivo para empezar a vender.', done: publishedCount > 0, href: firstEventId ? `/admin/events/${firstEventId}` : '/admin/events/new', cta: 'Publicar' },
  ];

  // ORDEN (2026-09-23, referencia aprobada): lo pendiente arriba (una fila con
  // fondo), después EL EVENTO QUE VIENE (flyer, tres cifras, escáner y link,
  // y sus acciones agrupadas), después tus eventos y lo pasado plegado.
  // Un solo primario por pantalla: con Yapes esperando es "Revisar Yapes";
  // si no, "Abrir escáner" del próximo evento.
  const hasDue = totalPending > 0 && !!firstPendingEvent;

  // Cortesías del próximo evento (entradas válidas de órdenes de cortesía).
  const courtesyOrderIds = new Set(paidOrderRows.filter((o) => o.payment_method === 'courtesy').map((o) => o.id));
  const courtesyByEvent = new Map<string, number>();
  for (const t of (validTicketRows ?? []) as { order_id: string }[]) {
    if (!courtesyOrderIds.has(t.order_id)) continue;
    const ev = eventoDeOrden.get(t.order_id);
    if (ev) courtesyByEvent.set(ev, (courtesyByEvent.get(ev) ?? 0) + 1);
  }

  // Tus eventos: los que vienen (y los borradores) a la vista; los que ya
  // pasaron, plegados en "Anteriores".
  const isPast = (e: { starts_at: string }) => Date.parse(e.starts_at) + 12 * 3600 * 1000 < nowMs;
  const upcoming = activeEvents.filter((e) => !isPast(e)).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const pastEvents = activeEvents.filter(isPast);
  const fmtWhen = (iso: string) => new Date(iso).toLocaleString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

  const createBtn = impersonating ? null : canCreate ? (
    <Link href="/admin/events/new" className="s-btn s-btn--soft s-btn--sm">
      <Plus aria-hidden="true" /> Crear evento
    </Link>
  ) : (
    <button type="button" className="s-btn s-btn--soft s-btn--sm" disabled title="Sin saldo de eventos">
      <Plus aria-hidden="true" /> Crear evento
    </button>
  );

  // EVENTOS como TARJETAS con su flyer (pedido de Paul, 2026-09-23): con dos o
  // tres eventos, el organizador elige cuál abrir mirando el flyer. Tocar la
  // tarjeta entra al panel de ESE evento.
  const eventCard = (e: (typeof activeEvents)[number]) => {
    const pend = pendingByEvent.get(e.id) ?? 0;
    const past = isPast(e);
    const hoy = !past && new Date(e.starts_at).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) === new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
    const status = !e.is_published ? { cls: 's-badge--draft', label: 'Borrador' }
      : past ? { cls: 's-badge--draft', label: 'Pasado' }
      : hoy ? { cls: 's-badge--todo', label: 'Hoy' }
      : { cls: 's-badge--ok', label: 'Publicado' };
    return (
      <li key={e.id}>
        <Link href={`/admin/events/${e.id}`} className={`a-evcard${past ? ' a-evcard--past' : ''}`}>
          <span className="a-evcard__flyer" aria-hidden="true">
            {e.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={optimizedImage(e.cover_url, { width: 480, quality: 75 })} alt="" loading="lazy" decoding="async" />
            ) : (
              <span>{(e.name.trim()[0] ?? '?').toUpperCase()}</span>
            )}
            {pend > 0 && <span className="a-nav__count a-evcard__pend" aria-label={`${pend} Yape por aprobar`}>{pend}</span>}
          </span>
          <span className="a-evcard__name">{e.name}</span>
          <span className="a-evcard__when">{fmtWhen(e.starts_at)}</span>
          <span className={`s-badge ${status.cls}`}>{status.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <>

      {/* 1) PENDIENTE — una fila con fondo, lo único con fondo de la pantalla. */}
      {hasDue && (
        <div className="s-due" role="status">
          <div className="s-due__txt">
            <span className="s-due__k">Por revisar</span>
            <span className="s-due__n">{totalPending} Yape{totalPending === 1 ? '' : 's'} por aprobar</span>
            <span className="s-due__sub">
              Hay gente esperando su QR{pendingEventCount > 1 && ` · en ${pendingEventCount} eventos`}.
            </span>
          </div>
          <Link href={`/admin/events/${firstPendingEvent!.id}/yape`} className="s-btn s-btn--primary s-btn--sm">Revisar Yapes</Link>
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

      {/* 2) TUS EVENTOS: tarjetas con el flyer. Primero los que vienen (el más
          cercano primero) y los borradores; lo pasado, plegado abajo. */}
      <section className="a-mine" aria-labelledby="a-mine-title">
        <div className="a-mine__head">
          <h1 id="a-mine-title" className="s-h1">Eventos</h1>
          {createBtn}
        </div>
        {!events || events.length === 0 ? (
          <p className="s-empty">
            {canCreate
              ? 'Todavía no creaste ningún evento. Usa “Crear evento” para arrancar.'
              : 'No tienes eventos. Cuando ParyGo te cargue saldo vas a poder crear el primero.'}
          </p>
        ) : upcoming.length === 0 ? (
          <p className="s-empty">No tienes eventos por venir. Los que ya pasaron están en “Anteriores”.</p>
        ) : (
          <ul className="a-evgrid">{upcoming.map(eventCard)}</ul>
        )}
      </section>

      {/* 4) LO PASADO, PLEGADO: los que ya pasaron y los archivados. */}
      <div className="s-folds">
        {pastEvents.length > 0 && (
          <details className="s-fold">
            <summary>
              <span className="s-fold__t">Anteriores · {pastEvents.length}</span>
              <ChevronDown aria-hidden="true" />
            </summary>
            <div className="s-fold__body">
              <ul className="a-evgrid a-evgrid--past">{pastEvents.map(eventCard)}</ul>
            </div>
          </details>
        )}
        {archivedEvents.length > 0 && (
          <details className="s-fold">
            <summary>
              <span className="s-fold__t">
                Archivados · {archivedEvents.length}
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
      </div>

      {/* Tu pack: una línea al pie, como en la referencia. */}
      <p className="a-pack">
        {balance > 0
          ? <>Te quedan {balance} evento{balance === 1 ? '' : 's'} en tu pack.</>
          : <>No te quedan eventos en tu pack.</>}
        {!impersonating && publicEnv.NEXT_PUBLIC_SUPPORT_WHATSAPP && (
          <>
            {' '}
            <a className="s-textlink" href={`https://wa.me/${publicEnv.NEXT_PUBLIC_SUPPORT_WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola, quiero comprar más eventos para ${brand.name}.`)}`} target="_blank" rel="noopener noreferrer">
              Comprar más
            </a>
          </>
        )}
      </p>
    </>
  );
}
