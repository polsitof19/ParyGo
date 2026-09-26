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
import { ArchiveToggle } from '@/components/manage/ArchiveToggle';
import { setEventArchivedAction } from './events/[id]/edit-actions';
import { pruebaDisponible } from '@/lib/prueba';
import { todas } from '@/lib/todas';
import { textosPanel } from '@/lib/idiomaServer';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const user = await requireSession();
  const { t, loc } = await textosPanel();
  // Marca activa: brand_admin → su marca; super admin con cookie → la marca que
  // VE en solo lectura. El layout ya gatea; esto es defensa + saber si impersona.
  const ctx = ownerBrandContext(user);
  if (!ctx) return null;
  const brandId = ctx.brandId;
  const impersonating = ctx.soloLectura;

  // TODO en un solo viaje en paralelo (2026-09-25): antes eran cuatro tandas
  // seguidas y se bajaban TODAS las órdenes pagadas y TODAS las entradas de la
  // marca, dos veces (Code: 491 órdenes y 1.218 entradas en cada visita), para
  // cifras que la portada ya no muestra. Lo único que se usaba era detectar
  // órdenes pagadas sin entradas: ahora lo resuelve la base con un anti-join.
  const supabase = createClient();
  const adminCli = createAdminClient();
  const [{ data: brand }, { data: events }, pendingProofs, stuckRows, { count: activeTypeCount }, { data: mpStatus }, pruebaLibre] = await Promise.all([
    supabase.from('brands').select('id, slug, name, yape_number, event_balance').eq('id', brandId).single(),
    supabase
      .from('events')
      .select('id, slug, name, starts_at, is_published, cover_url, archived_at, venue_name')
      .eq('brand_id', brandId)
      .order('starts_at', { ascending: false }),
    todas((a, b) => supabase
      .from('yape_proofs')
      .select('id, order:orders!yape_proofs_order_id_fkey ( event_id )')
      .eq('brand_id', brandId)
      .eq('status', 'pending_review')
      .order('id')
      .range(a, b)),
    // Recuperación: órdenes PAGADAS sin tickets (red de seguridad del flujo
    // Yape no atómico). Service role acotado a la marca. Normalmente vacío.
    todas((a, b) => adminCli.from('orders').select('id, buyer_name, total_cents, created_at, event_id, tickets!left(id)').eq('brand_id', brandId).eq('status', 'paid').is('tickets', null).order('id').range(a, b)),
    adminCli.from('ticket_types').select('id, events!inner(brand_id)', { count: 'exact', head: true }).eq('events.brand_id', brandId).eq('is_active', true),
    adminCli.rpc('get_brand_mp_status', { p_brand_id: brandId }),
    impersonating ? Promise.resolve(false) : pruebaDisponible(brandId),
  ]);
  if (!brand) return null;

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

  const mpRow = Array.isArray(mpStatus) ? mpStatus[0] : null;
  const mpConfigured = Boolean(mpRow?.has_access_token && mpRow?.has_public_key);
  const eventNameById = new Map((events ?? []).map((e) => [e.id, e.name] as const));
  const nowMs = Date.now();
  const firstPendingEvent = activeEvents.find((e) => (pendingByEvent.get(e.id) ?? 0) > 0) ?? null;
  const stuckOrders = ((stuckRows ?? []) as { id: string; buyer_name: string | null; total_cents: number | null; created_at: string; event_id: string }[])
    .map((o) => ({ id: o.id, buyerName: o.buyer_name, totalCents: o.total_cents ?? 0, createdAt: o.created_at, eventName: eventNameById.get(o.event_id) ?? t('Evento', 'Event') }));

  const balance = brand.event_balance ?? 0;
  // Sin saldo, la prueba gratis (0069) también deja crear (una sola vez).
  const canCreate = balance > 0 || pruebaLibre;

  // Setup guiado (Grupo B): progreso DERIVADO de los datos (no hay flag en BD).
  // Pasos = configurar cobro → crear evento → cargar entradas → publicar.
  const cobroReady = Boolean(brand.yape_number) || mpConfigured;
  const hasEvent = (events?.length ?? 0) > 0;
  const hasTickets = (activeTypeCount ?? 0) > 0;
  const firstEventId = activeEvents[0]?.id ?? (events ?? [])[0]?.id ?? null;
  const setupSteps: SetupStep[] = [
    { key: 'cobro', title: t('Configura tu cobro', 'Set up your payments'), desc: t('Carga tu Yape (o tus credenciales de tarjeta) para recibir los pagos.', 'Add your Yape (or your card credentials) to start receiving payments.'), done: cobroReady, href: '/admin/settings', cta: t('Configurar', 'Set up') },
    { key: 'evento', title: t('Crea tu primer evento', 'Create your first event'), desc: t('Nombre, fecha y lugar. Te toma un par de minutos.', 'Name, date and venue. It takes you a couple of minutes.'), done: hasEvent, href: '/admin/events/new', cta: t('Crear', 'Create') },
    { key: 'entradas', title: t('Carga tus entradas', 'Add your tickets'), desc: t('Define tipos de entrada, precios y cupos.', 'Define ticket types, prices and capacity.'), done: hasTickets, href: firstEventId ? `/admin/events/${firstEventId}/editar#entradas` : '/admin/events/new', cta: t('Cargar', 'Add') },
    { key: 'publicar', title: t('Publica tu evento', 'Publish your event'), desc: t('Cuando esté listo, ponlo en vivo para empezar a vender.', 'When it is ready, take it live to start selling.'), done: publishedCount > 0, href: firstEventId ? `/admin/events/${firstEventId}` : '/admin/events/new', cta: t('Publicar', 'Publish') },
  ];

  // ORDEN (2026-09-23, referencia aprobada): lo pendiente arriba (una fila con
  // fondo), después EL EVENTO QUE VIENE (flyer, tres cifras, escáner y link,
  // y sus acciones agrupadas), después tus eventos y lo pasado plegado.
  // Un solo primario por pantalla: con Yapes esperando es "Revisar Yapes";
  // si no, "Abrir escáner" del próximo evento.
  const hasDue = totalPending > 0 && !!firstPendingEvent;

  // Tus eventos: los que vienen (y los borradores) a la vista; los que ya
  // pasaron, plegados en "Anteriores".
  const isPast = (e: { starts_at: string }) => Date.parse(e.starts_at) + 12 * 3600 * 1000 < nowMs;
  const upcoming = activeEvents.filter((e) => !isPast(e)).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const pastEvents = activeEvents.filter(isPast);
  const fmtWhen = (iso: string) => new Date(iso).toLocaleString(loc, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

  const createBtn = impersonating ? null : canCreate ? (
    <Link href="/admin/events/new" className="s-btn s-btn--soft s-btn--sm">
      <Plus aria-hidden="true" /> {t('Crear evento', 'Create event')}
    </Link>
  ) : (
    <Link href="/admin/comprar" className="s-btn s-btn--soft s-btn--sm">
      <Plus aria-hidden="true" /> {t('Comprar eventos', 'Buy events')}
    </Link>
  );

  // EVENTOS como TARJETAS con su flyer (pedido de Paul, 2026-09-23): con dos o
  // tres eventos, el organizador elige cuál abrir mirando el flyer. Tocar la
  // tarjeta entra al panel de ESE evento.
  const eventCard = (e: (typeof activeEvents)[number]) => {
    const pend = pendingByEvent.get(e.id) ?? 0;
    const past = isPast(e);
    const hoy = !past && new Date(e.starts_at).toLocaleDateString(loc, { timeZone: 'America/Lima' }) === new Date().toLocaleDateString(loc, { timeZone: 'America/Lima' });
    const status = !e.is_published ? { cls: 's-badge--draft', label: t('Borrador', 'Draft') }
      : past ? { cls: 's-badge--draft', label: t('Pasado', 'Past') }
      : hoy ? { cls: 's-badge--todo', label: t('Hoy', 'Today') }
      : { cls: 's-badge--ok', label: t('Publicado', 'Published') };
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
            {pend > 0 && <span className="a-nav__count a-evcard__pend" aria-label={t(`${pend} Yape por aprobar`, `${pend} Yape to approve`)}>{pend}</span>}
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
            <span className="s-due__k">{t('Por revisar', 'To review')}</span>
            <span className="s-due__n">{t(`${totalPending} Yape${totalPending === 1 ? '' : 's'} por aprobar`, `${totalPending} Yape${totalPending === 1 ? '' : 's'} to approve`)}</span>
            <span className="s-due__sub">
              {t('Hay gente esperando su QR', 'People are waiting for their QR')}{pendingEventCount > 1 && t(` · en ${pendingEventCount} eventos`, ` · in ${pendingEventCount} events`)}.
            </span>
          </div>
          <Link href={`/admin/events/${firstPendingEvent!.id}/yape`} className="s-btn s-btn--primary s-btn--sm">{t('Revisar Yapes', 'Review Yapes')}</Link>
        </div>
      )}

      {/* Aviso de saldo bajo (solo dueño): es una tarea, va arriba. */}
      {/* Con la prueba gratis sin usar, "te quedaste sin saldo" sería falso. */}
      {!impersonating && !(balance === 0 && canCreate) && (
        <LowBalanceNotice balance={balance} />
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
          <h1 id="a-mine-title" className="s-h1">{t('Eventos', 'Events')}</h1>
          {createBtn}
        </div>
        {!events || events.length === 0 ? (
          <p className="s-empty">
            {canCreate
              ? t('Todavía no creaste ningún evento. Usa “Crear evento” para arrancar.', 'You haven’t created an event yet. Use “Create event” to get started.')
              : t('No tienes eventos. Compra un pack con “Comprar eventos” para crear el primero.', 'You don’t have events. Buy a pack with “Buy events” to create your first one.')}
          </p>
        ) : upcoming.length === 0 ? (
          <p className="s-empty">{t('No tienes eventos por venir. Los que ya pasaron están en “Anteriores”.', 'You have no upcoming events. Past ones are under “Previous”.')}</p>
        ) : (
          <ul className="a-evgrid">{upcoming.map(eventCard)}</ul>
        )}
      </section>

      {/* 4) LO PASADO, PLEGADO: los que ya pasaron y los archivados. */}
      <div className="s-folds">
        {pastEvents.length > 0 && (
          <details className="s-fold">
            <summary>
              <span className="s-fold__t">{t('Anteriores', 'Previous')} · {pastEvents.length}</span>
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
                {t('Archivados', 'Archived')} · {archivedEvents.length}
                <span className="s-fold__hint">{t('No se venden ni aparecen en público. Puedes desarchivarlos.', 'They are not sold and do not appear publicly. You can unarchive them.')}</span>
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
                        {new Date(e.starts_at).toLocaleString(loc, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' })}
                      </span>
                    </Link>
                    <span className="s-badge s-badge--draft">{t('Archivado', 'Archived')}</span>
                    {!impersonating && <ArchiveToggle id={e.id} archived={true} action={setEventArchivedAction} noun={t('el evento', 'the event')} />}
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
          ? <>{t(`Te quedan ${balance} evento${balance === 1 ? '' : 's'} en tu pack.`, `You have ${balance} event${balance === 1 ? '' : 's'} left in your pack.`)}</>
          : <>{t('No te quedan eventos en tu pack.', 'You have no events left in your pack.')}</>}
        {/* Siempre a la compra del panel (0070); antes iba a WhatsApp y solo
            si había número de soporte cargado. */}
        {!impersonating && (
          <>
            {' '}
            <Link className="s-textlink" href="/admin/comprar">{t('Comprar más', 'Buy more')}</Link>
          </>
        )}
      </p>
    </>
  );
}
