import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// Panel de salud / observabilidad (SUPER ADMIN · SOLO LECTURA)
// =============================================================
// Vista rápida del estado de la plataforma: cola de emails (pendientes/fallidos),
// pagos por revisar (Yape), actividad del día e integridad de datos (oversell).
// No agrega dato nuevo ni muta nada — solo agrega lo que ya existe. El acceso lo
// blinda el layout (requireSession superAdmin); lee con el admin client porque
// son agregados cross-tenant (no de una sola marca).

type NjRow = { status: string; kind: string; attempts: number | null; last_error: string | null; created_at: string; sent_at: string | null };

// Inicio del día de HOY en horario Lima (UTC-5), como ISO UTC.
function limaTodayStartUtc(nowMs: number): string {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs));
  return `${ymd}T05:00:00.000Z`; // medianoche Lima = 05:00 UTC
}

export default async function SaludPage() {
  await requireSession({ superAdmin: true });
  const admin = createAdminClient();

  const nowMs = Date.now();
  const todayStart = limaTodayStartUtc(nowMs);
  const since14d = new Date(nowMs - 14 * 86_400_000).toISOString();
  const HEAD = { count: 'exact' as const, head: true };

  const [
    njRes, yapeRes, ordersTodayRes, ticketsTodayRes, oversellRes, brandsRes, eventsRes,
  ] = await Promise.all([
    // Cola de emails de los últimos 14 días (volumen chico → se agrega en JS).
    admin.from('notification_jobs').select('status, kind, attempts, last_error, created_at, sent_at').gte('created_at', since14d).order('created_at', { ascending: false }).limit(500),
    admin.from('orders').select('id', HEAD).eq('status', 'pending_yape_review'),
    admin.from('orders').select('id', HEAD).eq('status', 'paid').gte('created_at', todayStart),
    admin.from('tickets').select('id', HEAD).is('invalidated_at', null).gte('created_at', todayStart),
    // PostgREST no compara columna-con-columna → traemos los tipos con cupo y
    // contamos oversell (sold > capacity) en JS. Volumen chico (no ilimitados).
    admin.from('ticket_types').select('sold, capacity').eq('is_unlimited', false),
    admin.from('brands').select('id', HEAD).is('archived_at', null),
    admin.from('events').select('id', HEAD).eq('is_published', true).is('archived_at', null),
  ]);

  const nj = (njRes.data ?? []) as NjRow[];
  const isFailed = (s: string) => s === 'failed' || s === 'error';
  const isSent = (s: string) => s === 'sent';
  const isPending = (s: string) => !isFailed(s) && !isSent(s); // pending/queued/claimed/sending…
  const njPending = nj.filter((j) => isPending(j.status)).length;
  const njFailed = nj.filter((j) => isFailed(j.status));
  const njSent14d = nj.filter((j) => isSent(j.status)).length;
  const failedList = njFailed.slice(0, 8);

  const yapePending = yapeRes.count ?? 0;
  const ordersToday = ordersTodayRes.count ?? 0;
  const ticketsToday = ticketsTodayRes.count ?? 0;
  const oversell = ((oversellRes.data ?? []) as { sold: number | null; capacity: number | null }[])
    .filter((t) => (t.sold ?? 0) > (t.capacity ?? 0)).length;
  const brandsActive = brandsRes.count ?? 0;
  const eventsPublished = eventsRes.count ?? 0;

  const alerts: { tone: 'alert' | 'warn'; text: string }[] = [];
  if (oversell > 0) alerts.push({ tone: 'alert', text: `${oversell} tipo(s) de entrada con sold > capacidad (oversell). Revisar de inmediato.` });
  if (njFailed.length > 0) alerts.push({ tone: 'warn', text: `${njFailed.length} email(s) fallaron en la cola (últimos 14 días).` });
  if (yapePending > 0) alerts.push({ tone: 'warn', text: `${yapePending} pago(s) Yape esperando revisión de algún organizador.` });

  return (
    <>
      <header className="s-pagehead">
        <div>
          <span className="eyebrow">Plataforma</span>
          <h1 className="s-h1">Salud</h1>
          <p className="s-card__desc">Estado en vivo de la plataforma. Solo lectura.</p>
        </div>
      </header>

      {/* Alertas: punto de color + texto en tinta. Sin alertas, una sola nota ok. */}
      <div className="s-notices" role="status">
        {alerts.length > 0
          ? alerts.map((a, i) => <p key={i} className={`s-notice s-notice--${a.tone}`}>{a.text}</p>)
          : <p className="s-notice s-notice--ok">Todo en orden — sin alertas.</p>}
      </div>

      {/* Actividad: inventario, sin color. */}
      <div className="s-stats-4" style={{ marginBottom: 16 }}>
        <Kpi label="Marcas activas" value={brandsActive} />
        <Kpi label="Eventos publicados" value={eventsPublished} />
        <Kpi label="Órdenes pagadas hoy" value={ordersToday} sub="horario Lima" />
        <Kpi label="Entradas emitidas hoy" value={ticketsToday} sub="horario Lima" />
      </div>

      {/* Cola de emails: el punto aparece solo si hay fallidos. */}
      <div className="s-card" style={{ marginBottom: 16 }}>
        <h2 className="s-card__title">Cola de emails</h2>
        <p className="s-card__desc">notification_jobs · últimos 14 días</p>
        <div className="s-stats-4" style={{ marginTop: 14 }}>
          <Kpi label="Pendientes" value={njPending} sub="por enviar / en proceso" />
          <Kpi label="Fallidos" value={njFailed.length} sub="últimos 14 días" todo={njFailed.length > 0} />
          <Kpi label="Enviados" value={njSent14d} sub="últimos 14 días" />
        </div>
        {failedList.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <p className="s-section-lead">Últimos fallidos</p>
            <ul className="s-hlist">
              {failedList.map((j, i) => (
                <li key={i}>
                  <div className="s-hlist__row">
                    <strong>{j.kind}</strong>
                    <span className="s-muted s-small">{new Date(j.created_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })} · {j.attempts ?? 0} intento(s)</span>
                  </div>
                  {j.last_error && <p className="s-muted s-small" style={{ marginTop: 2, wordBreak: 'break-word' }}>{j.last_error.slice(0, 200)}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Pagos por revisar + integridad: el punto aparece solo si hay algo. */}
      <div className="s-form-grid" style={{ gap: 14 }}>
        <div className={`s-stat${yapePending > 0 ? ' s-stat--alert' : ''}`}>
          <span className="s-stat__label">Pagos Yape por revisar</span>
          <span className="s-stat__value">{yapePending}</span>
          <span className="s-stat__sub">Órdenes en <code>pending_yape_review</code> en toda la plataforma.</span>
        </div>
        <div className={`s-stat${oversell > 0 ? ' s-stat--alert s-stat--crit' : ''}`}>
          <span className="s-stat__label">Integridad de stock</span>
          <span className="s-stat__value">{oversell}</span>
          <span className="s-stat__sub">Tipos con <code>sold &gt; capacidad</code> (oversell). Debe ser 0.</span>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, sub, todo = false }: { label: string; value: number; sub?: string; todo?: boolean }) {
  return (
    <div className={`s-stat${todo ? ' s-stat--alert' : ''}`}>
      <span className="s-stat__label">{label}</span>
      <span className="s-stat__value">{value}</span>
      {sub && <span className="s-stat__sub">{sub}</span>}
    </div>
  );
}
