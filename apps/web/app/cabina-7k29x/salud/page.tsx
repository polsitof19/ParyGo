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
      <div style={{ marginBottom: 16 }}>
        <span className="eyebrow">Plataforma</span>
        <h1 className="s-h2" style={{ marginTop: 2 }}>Salud y observabilidad</h1>
        <p className="s-card__desc">Estado en vivo de la plataforma. Solo lectura.</p>
      </div>

      {/* Alertas (si hay) — dot de color del sistema, sin emojis */}
      {alerts.length > 0 && (
        <div className="s-stack" style={{ gap: 8, marginBottom: 16 }}>
          {alerts.map((a, i) => (
            <div key={i} className="s-card" style={{ padding: '12px 16px', borderLeft: `4px solid var(--${a.tone})`, display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: `var(--${a.tone})`, flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{a.text}</span>
            </div>
          ))}
        </div>
      )}
      {alerts.length === 0 && (
        <div className="s-card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--ok)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Todo en orden — sin alertas.</span>
        </div>
      )}

      {/* KPIs */}
      <div className="s-stats-4" style={{ marginBottom: 16 }}>
        <Kpi label="Marcas activas" value={String(brandsActive)} />
        <Kpi label="Eventos publicados" value={String(eventsPublished)} />
        <Kpi label="Órdenes pagadas hoy" value={String(ordersToday)} sub="horario Lima" />
        <Kpi label="Entradas emitidas hoy" value={String(ticketsToday)} sub="horario Lima" />
      </div>

      {/* Cola de emails */}
      <div className="s-card" style={{ marginBottom: 16 }}>
        <p className="s-card__title">Cola de emails (notification_jobs)</p>
        <div className="s-stats-4" style={{ marginTop: 4 }}>
          <Kpi label="Pendientes" value={String(njPending)} sub="por enviar / en proceso" />
          <Kpi label="Fallidos" value={String(njFailed.length)} sub="últimos 14 días" />
          <Kpi label="Enviados" value={String(njSent14d)} sub="últimos 14 días" />
        </div>
        {failedList.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <p className="s-muted" style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Últimos fallidos</p>
            <div className="s-stack" style={{ gap: 6 }}>
              {failedList.map((j, i) => (
                <div key={i} style={{ borderTop: '1px solid var(--cream-3)', paddingTop: 6, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <strong>{j.kind}</strong>
                    <span className="s-muted" style={{ fontSize: 12 }}>{new Date(j.created_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })} · {j.attempts ?? 0} intento(s)</span>
                  </div>
                  {j.last_error && <p className="s-muted" style={{ fontSize: 12, marginTop: 2, wordBreak: 'break-word' }}>{j.last_error.slice(0, 200)}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pagos por revisar + integridad */}
      <div className="s-form-grid" style={{ gap: 12 }}>
        <div className="s-card">
          <p className="s-card__title">Pagos Yape por revisar</p>
          <p style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 30 }}>{yapePending}</p>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 2 }}>Órdenes en <code>pending_yape_review</code> en toda la plataforma.</p>
        </div>
        <div className="s-card">
          <p className="s-card__title">Integridad de stock</p>
          <p style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 30, color: oversell > 0 ? 'var(--alert)' : 'var(--ok)' }}>{oversell}</p>
          <p className="s-muted" style={{ fontSize: 12.5, marginTop: 2 }}>Tipos con <code>sold &gt; capacidad</code> (oversell). Debe ser 0.</p>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="s-stat">
      <span className="s-stat__label">{label}</span>
      <span className="s-stat__value">{value}</span>
      {sub && <span className="s-stat__sub">{sub}</span>}
    </div>
  );
}
