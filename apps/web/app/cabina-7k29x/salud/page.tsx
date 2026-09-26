import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { todas } from '@/lib/todas';
import { idsMarcasDePrueba, sinMarcasDePrueba, soloConComprobante } from '@/lib/marcasDePrueba';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// SALUD de la plataforma (super admin · solo lectura), rediseño 2026-09-26.
// =============================================================
// Pregunta una sola cosa: ¿algo está fallando? Arriba las alertas en palabras
// de dueño (o "Todo funciona bien"); abajo los correos, lo de hoy, los
// controles que deben dar cero y lo que Paul hizo dentro de marcas ajenas.
// Sin nombres de tablas ni de estados de la base en pantalla.
//
// BUG CERRADO (2026-09-26): el destructuring del Promise.all tenía cruzados
// "eventos publicados" y "acciones de super admin" — la cifra salía siempre 0
// y la auditoría del modo edición siempre vacía. Ahora cada consulta tiene su
// nombre al lado, y una que falla se muestra como "—", nunca como 0.

type NjRow = { status: string; kind: string; attempts: number | null; last_error: string | null; created_at: string };

// Inicio del día de HOY en horario Lima (UTC-5), como ISO UTC.
function limaTodayStartUtc(nowMs: number): string {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs));
  return `${ymd}T05:00:00.000Z`; // medianoche Lima = 05:00 UTC
}

const ETIQUETA_SUPER: Record<string, string> = {
  super_edit_mode_on: 'Encendiste el modo edición',
  super_edit_mode_off: 'Apagaste el modo edición',
  impersonation_started: 'Entraste a la marca',
  impersonation_ended: 'Saliste de la marca',
};

// Qué cambiaste con el modo edición, en palabras (acciones de auditarEscrituraSuper).
const ACCION: Record<string, string> = {
  brand_idioma_updated: 'el idioma del panel', brand_mp_credentials_removed: 'quitaste las credenciales de Mercado Pago', brand_mp_credentials_updated: 'las credenciales de Mercado Pago', brand_settings_updated: 'los datos de la marca',
  courtesy_issued: 'emitiste cortesías', event_cancelled: 'cancelaste un evento', event_cancelled_notified: 'avisaste la cancelación', event_cloned: 'duplicaste un evento', event_cover_updated: 'el flyer del evento', event_created: 'creaste un evento', event_deleted: 'borraste un evento', event_postponed: 'cambiaste la fecha de un evento', event_postponed_notified: 'avisaste el cambio de fecha', event_date_changed: 'la fecha del evento', event_edited: 'los datos del evento',
  gate_code_generated: 'creaste un código de puerta', gate_code_revoked: 'anulaste un código de puerta', promo_code_created: 'creaste un código promocional', promo_code_emailed: 'enviaste un código por correo', promo_code_revoked: 'anulaste un código promocional',
  ticket_email_resent: 'reenviaste una entrada', ticket_type_access_changed: 'el acceso de un tipo de entrada', ticket_type_created: 'creaste un tipo de entrada', ticket_type_edited: 'un tipo de entrada', ticket_type_moved: 'el orden de las entradas', ticket_voided: 'anulaste una entrada', tickets_reissued: 'reemitiste entradas',
  validator_invited: 'invitaste a alguien de puerta', validator_password_set: 'la contraseña de alguien de puerta', validator_personal_code_generated: 'un código personal de puerta', yape_approved: 'aprobaste un Yape', yape_approved_issue_failed: 'un Yape aprobado sin entrada', yape_rejected: 'rechazaste un Yape',
};

// 'creaste un evento' ya es una frase; 'el flyer del evento' necesita el verbo.
function textoAccion(accion?: string): string {
  const t = accion ? ACCION[accion] : undefined;
  if (!t) return 'Cambiaste algo';
  return /^[a-záéíóú]+aste /.test(t) ? t.charAt(0).toUpperCase() + t.slice(1) : `Cambiaste ${t}`;
}

// Qué correo era, en palabras (kind de la cola → nombre).
const CORREO: Record<string, string> = {
  ticket_email: 'Entrada al comprador',
  yape_pending_digest: 'Aviso de Yapes al organizador',
  yape_recovery: 'Recordatorio de Yape al comprador',
  event_reminder: 'Recordatorio del evento',
  event_cancelled: 'Aviso de evento cancelado',
  event_postponed: 'Aviso de cambio de fecha',
};

export default async function SaludPage() {
  await requireSession({ superAdmin: true });
  const admin = createAdminClient();

  const nowMs = Date.now();
  const todayStart = limaTodayStartUtc(nowMs);
  const since14d = new Date(nowMs - 14 * 86_400_000).toISOString();
  const HEAD = { count: 'exact' as const, head: true };
  const prueba = await idsMarcasDePrueba(admin);

  const [correos, yapes, comprasHoy, entradasHoy, cupos, acciones, marcasRes, duenosRes, pagadasRes] = await Promise.all([
    todas((a, b) => admin.from('notification_jobs').select('status, kind, attempts, last_error, created_at').gte('created_at', since14d).order('created_at', { ascending: false }).order('id').range(a, b))
      .then((data) => ({ data: data as NjRow[], error: null as null | Error }), (error: Error) => ({ data: [] as NjRow[], error })),
    soloConComprobante(sinMarcasDePrueba(admin.from('orders').select('id', HEAD).eq('status', 'pending_yape_review'), prueba)),
    sinMarcasDePrueba(admin.from('orders').select('id', HEAD).eq('status', 'paid').gte('created_at', todayStart), prueba),
    sinMarcasDePrueba(admin.from('tickets').select('id', HEAD).is('invalidated_at', null).gte('created_at', todayStart), prueba),
    // PostgREST no compara columna con columna: se traen los tipos con cupo y
    // se cuenta en JS (volumen chico, los ilimitados no entran).
    admin.from('ticket_types').select('sold, capacity').eq('is_unlimited', false),
    admin.from('events_log')
      .select('created_at, type, payload, brand:brands ( name )')
      .in('type', ['super_admin_write', 'super_edit_mode_on', 'super_edit_mode_off', 'impersonation_started', 'impersonation_ended'])
      .gte('created_at', since14d)
      .order('created_at', { ascending: false })
      .order('id')
      .range(0, 199),
    admin.from('brands').select('id, name, slug, event_balance, archived_at'),
    admin.from('brand_members').select('brand_id').eq('role', 'brand_admin'),
    // Altas que pagaron su paquete: si la marca sigue sin dueño, pagó y no terminó.
    admin.from('pack_purchases').select('brand_id').eq('status', 'paid').is('created_by', null),
  ]);

  // Un número que no se pudo leer es "—", no 0: un cero falso dice "todo bien".
  const n = (r: { count: number | null; error: unknown }) => (r.error ? null : r.count ?? 0);
  const nj = correos.data;
  const fallidos = nj.filter((j) => j.status === 'failed' || j.status === 'error');
  const enviados = nj.filter((j) => j.status === 'sent').length;
  const enEspera = nj.length - fallidos.length - enviados;
  const yapesSinRevisar = n(yapes);
  const vendidasDeMas = cupos.error ? null : (cupos.data ?? []).filter((t) => (t.sold ?? 0) > (t.capacity ?? 0)).length;
  const lista = (acciones.data ?? []) as unknown as { created_at: string; type: string; payload: unknown; brand: { name: string } | { name: string }[] | null }[];

  const pl = (x: number, uno: string, varios: string) => `${x} ${x === 1 ? uno : varios}`;
  const esPrueba = new Set(prueba);
  const marcas = (marcasRes.data ?? []).filter((b) => !esPrueba.has(b.id));
  const conDueno = new Set((duenosRes.data ?? []).map((m) => m.brand_id));
  const activas = marcas.filter((b) => !b.archived_at);
  const sinDueno = activas.filter((b) => !conDueno.has(b.id));
  const sinSaldo = activas.filter((b) => (b.event_balance ?? 0) === 0 && conDueno.has(b.id));
  const pagoSinTerminar = [...new Set((pagadasRes.data ?? []).map((p) => p.brand_id))]
    .map((id) => marcas.find((b) => b.id === id))
    .filter((b): b is NonNullable<typeof b> => !!b && !conDueno.has(b.id));
  const nombres = (l: { name: string }[]) => l.slice(0, 3).map((b) => b.name).join(', ') + (l.length > 3 ? ` y ${l.length - 3} más` : '');

  type Tarea = { titulo: string; sub: string; href: string; cta: string; grave?: boolean };
  const tareas: Tarea[] = [];
  if (vendidasDeMas) tareas.push({ grave: true, titulo: `${pl(vendidasDeMas, 'tipo de entrada vendió', 'tipos de entrada vendieron')} más de su cupo`, sub: 'No debería pasar nunca. Avisa para revisarlo.', href: '#sal-ctrl-sec', cta: 'Ver controles' });
  if (pagoSinTerminar.length > 0) tareas.push({ titulo: `${pl(pagoSinTerminar.length, 'marca pagó', 'marcas pagaron')} y no terminó su registro`, sub: `${nombres(pagoSinTerminar)} · ya se le envió el link para terminar; si no entra, escríbele.`, href: `/cabina-7k29x/brands/${pagoSinTerminar[0]!.slug}`, cta: 'Ver marca' });
  if (fallidos.length > 0) tareas.push({ titulo: pl(fallidos.length, 'correo no salió', 'correos no salieron'), sub: 'En los últimos 14 días. Puede ser una entrada que no le llegó a alguien.', href: '#sal-correos-sec', cta: 'Ver cuáles' });
  if (sinDueno.length > 0) tareas.push({ titulo: pl(sinDueno.length, 'marca sin dueño', 'marcas sin dueño'), sub: `${nombres(sinDueno)} · nadie puede entrar a su panel.`, href: `/cabina-7k29x/brands/${sinDueno[0]!.slug}`, cta: 'Asignar dueño' });
  if (yapesSinRevisar) tareas.push({ titulo: `${pl(yapesSinRevisar, 'Yape espera', 'Yapes esperan')} que su marca lo revise`, sub: 'Comprobantes subidos que el organizador todavía no aprobó.', href: '#sal-ctrl-sec', cta: 'Ver controles' });
  if (sinSaldo.length > 0) tareas.push({ titulo: `${pl(sinSaldo.length, 'marca se quedó', 'marcas se quedaron')} sin eventos en su pack`, sub: `${nombres(sinSaldo)} · no pueden crear otro evento hasta comprar.`, href: `/cabina-7k29x/brands/${sinSaldo[0]!.slug}#saldo`, cta: 'Ver marca' });
  const [primera, ...resto] = tareas;
  const sinLeer = [correos.error, yapes.error, comprasHoy.error, entradasHoy.error, cupos.error, marcasRes.error, duenosRes.error].some(Boolean);

  const hora = (iso: string) => new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <>
      <header className="s-pagehead">
        <div>
          <h1 className="s-h1">Salud</h1>
          <p className="s-card__desc">Arriba lo que te toca resolver; abajo, cómo está funcionando todo.</p>
        </div>
      </header>

      {/* 1) LO QUE TE TOCA: una fila con fondo (la más urgente) y el resto en
          líneas. Sin nada pendiente, una línea en verde. */}
      {sinLeer && <p className="s-notice s-notice--warn" role="status">Una parte de esta página no se pudo leer (sale como "—"). Recarga en un momento.</p>}
      {primera ? (
        <>
          <div className={`s-due${primera.grave ? ' s-due--grave' : ''}`} role="status">
            <div className="s-due__txt">
              <span className="s-due__k">Por resolver</span>
              <span className="s-due__n">{primera.titulo}</span>
              <span className="s-due__sub">{primera.sub}</span>
            </div>
            <Link href={primera.href} className="s-btn s-btn--primary">{primera.cta}</Link>
          </div>
          {resto.length > 0 && (
            <div className="s-todos">
              {resto.map((t) => (
                <div key={t.titulo} className={`s-todo${t.grave ? ' s-todo--alert' : ''}`}>
                  <span className="s-todo__txt"><span><strong>{t.titulo}</strong><span className="s-todo__sub">{t.sub}</span></span></span>
                  <Link href={t.href} className="s-btn s-btn--soft s-btn--sm">{t.cta}</Link>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="s-calm s-calm--ok">Todo funciona bien: nada que te toque resolver.</p>
      )}

      <section className="s-section" aria-labelledby="sal-hoy">
        <h2 className="s-h2 s-h2--sec" id="sal-hoy">Hoy</h2>
        <div className="s-stats">
          <Cifra label="Compras de entradas" valor={n(comprasHoy)} sub="en todas las marcas" />
          <Cifra label="Entradas emitidas" valor={n(entradasHoy)} sub="pagadas, gratis y cortesías" />
        </div>
      </section>

      <section className="s-section" id="sal-ctrl-sec" aria-labelledby="sal-ctrl">
        <h2 className="s-h2 s-h2--sec" id="sal-ctrl">Controles</h2>
        <div className="s-stats">
          <Cifra label="Yapes sin revisar" valor={yapesSinRevisar} sub="comprobantes que la marca no aprobó" alerta={!!yapesSinRevisar} />
          <Cifra label="Entradas vendidas de más" valor={vendidasDeMas} sub="siempre tiene que ser 0" alerta={!!vendidasDeMas} grave />
        </div>
      </section>

      <section className="s-section" id="sal-correos-sec" aria-labelledby="sal-correos">
        <h2 className="s-h2 s-h2--sec" id="sal-correos">Correos · últimos 14 días</h2>
        <div className="s-stats">
          <Cifra label="Enviados" valor={correos.error ? null : enviados} />
          <Cifra label="No salieron" valor={correos.error ? null : fallidos.length} alerta={fallidos.length > 0} />
          <Cifra label="En espera" valor={correos.error ? null : enEspera} sub="salen en menos de un minuto" />
        </div>
        {fallidos.length > 0 && (
          <>
            <p className="s-section-lead">Los que no salieron</p>
            <ul className="s-hlist">
              {fallidos.slice(0, 8).map((j, i) => (
                <li key={i}>
                  <div className="s-hlist__row">
                    <strong>{CORREO[j.kind] ?? 'Otro correo'}</strong>
                    <span className="s-muted s-small">{hora(j.created_at)} · {pl(j.attempts ?? 0, 'intento', 'intentos')}</span>
                  </div>
                  {j.last_error && <p className="s-muted s-small s-break">{j.last_error.slice(0, 160)}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Lo que Paul tocó dentro de marcas ajenas: el contrapeso del modo
          edición. Si no se puede reconstruir después, no debería poder hacerse. */}
      <section className="s-section" aria-labelledby="sal-yo">
        <h2 className="s-h2 s-h2--sec" id="sal-yo">Lo que hiciste dentro de marcas · 14 días</h2>
        {acciones.error ? (
          <p className="s-calm">No se pudo leer el registro. Recarga en un momento.</p>
        ) : lista.length === 0 ? (
          <p className="s-calm">No entraste a ninguna marca en los últimos 14 días.</p>
        ) : (
          <>
          {/* Las últimas 6 a la vista; el resto, plegado: dos semanas de
              entradas y salidas hacían la página interminable. */}
          {[lista.slice(0, 6), lista.slice(6)].map((tramo, t) => tramo.length > 0 && (
          <Plegable key={t} abierto={t === 0} titulo={`Ver las ${tramo.length} anteriores`}>
          <ul className="s-hlist">
            {tramo.map((a, i) => {
              const marca = Array.isArray(a.brand) ? a.brand[0] : a.brand;
              const p = (a.payload ?? {}) as { accion?: string; modo?: string; diff?: Record<string, unknown> };
              const escritura = a.type === 'super_admin_write';
              const campos = escritura && p.diff ? Object.keys(p.diff).slice(0, 4).join(', ') : '';
              return (
                <li key={i}>
                  <div className="s-hlist__row">
                    <span style={{ minWidth: 0 }}>
                      <strong>{escritura ? textoAccion(p.accion) : ETIQUETA_SUPER[a.type] ?? 'Acción'}</strong>
                      <span className="s-muted s-small"> · {marca?.name ?? 'marca'}</span>
                    </span>
                    <span className="s-muted s-small s-nowrap">{hora(a.created_at)}</span>
                  </div>
                  {campos && <p className="s-muted s-small">Campos: {campos.replace(/_/g, ' ')}</p>}
                </li>
              );
            })}
          </ul>
          </Plegable>
          ))}
          </>
        )}
      </section>
    </>
  );
}

// El primer tramo va abierto sin marco; el resto, en un plegable con título.
function Plegable({ abierto, titulo, children }: { abierto: boolean; titulo: string; children: React.ReactNode }) {
  if (abierto) return <>{children}</>;
  return (
    <details className="s-fold s-folds">
      <summary><span className="s-fold__t">{titulo}</span></summary>
      <div className="s-fold__body">{children}</div>
    </details>
  );
}

function Cifra({ label, valor, sub, alerta = false, grave = false }: { label: string; valor: number | null; sub?: string; alerta?: boolean; grave?: boolean }) {
  return (
    <div className={`s-stat${alerta ? ' s-stat--alert' : ''}${alerta && grave ? ' s-stat--crit' : ''}`}>
      <span className="s-stat__label">{label}</span>
      <span className="s-stat__value">{valor === null ? '—' : valor.toLocaleString('es-PE')}</span>
      {sub && <span className="s-stat__sub">{sub}</span>}
    </div>
  );
}
