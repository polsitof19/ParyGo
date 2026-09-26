import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { todas } from '@/lib/todas';
import { idsMarcasDePrueba, sinMarcasDePrueba, soloConComprobante } from '@/lib/marcasDePrueba';
import { VentasPacks } from './VentasPacks';
import { Barras, Cifras, EventoCard, Flyer, MarcaCard } from './visual';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// INICIO de la cabina. Segundo rediseño (2026-09-26, Paul: "no me gusta que
// sea todo letras, tiene que ser como el panel del organizador, bonito").
// Mismo lenguaje visual que /admin:
//   1. Lo que te toca (una fila con fondo) o "Todo en orden".
//   2. EL EVENTO QUE SE ESTÁ VENDIENDO, en grande: flyer, nombre y tres
//      cifras (entradas, vendidas hoy, entraron). Si hay más, sus flyers.
//   3. Entradas por día, 14 días: barras (toda la plataforma, sin pruebas).
//   4. Tus ventas de paquetes: tres cifras grandes (hoy · 7 días · mes).
//   5. Marcas: tarjetas con su logo.
// Todo sin marcas de prueba. Un dato que no se pudo leer es "—", no 0.
// =============================================================

const DIA = 86_400_000;
const LIMA = 5 * 3_600_000;
type Tarea = { titulo: string; sub: string; href: string; cta: string; grave?: boolean };

export default async function Inicio() {
  const admin = createAdminClient();
  const prueba = await idsMarcasDePrueba(admin);
  const esPrueba = new Set(prueba);
  const HEAD = { count: 'exact' as const, head: true };
  const ahora = Date.now();
  const l = new Date(ahora - LIMA);
  const hoy = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) + LIMA; // medianoche de Lima
  const desde14 = hoy - 13 * DIA;

  const [brandsRes, membersRes, yapeRes, pagadasRes, correosRes, cuposRes, eventosRes, ticketsRes] = await Promise.all([
    admin.from('brands').select('id, name, slug, event_balance, archived_at, theme_json'),
    admin.from('brand_members').select('brand_id').eq('role', 'brand_admin'),
    soloConComprobante(sinMarcasDePrueba(admin.from('orders').select('id', HEAD).eq('status', 'pending_yape_review'), prueba)),
    admin.from('pack_purchases').select('brand_id').eq('status', 'paid').is('created_by', null),
    admin.from('notification_jobs').select('id', HEAD).in('status', ['failed', 'error']).gte('created_at', new Date(ahora - 14 * DIA).toISOString()),
    admin.from('ticket_types').select('sold, capacity').eq('is_unlimited', false),
    admin.from('events').select('id, name, starts_at, ends_at, brand_id, cover_url').eq('is_published', true).is('archived_at', null),
    // Entradas emitidas en 14 días (no anuladas), para las barras.
    todas((a, b) => sinMarcasDePrueba(admin.from('tickets').select('created_at').is('invalidated_at', null).gte('created_at', new Date(desde14).toISOString()), prueba).order('id').range(a, b))
      .then((data) => ({ data: data as { created_at: string }[], error: null }), (error: Error) => ({ data: [] as { created_at: string }[], error })),
  ]);

  const leido = !brandsRes.error && !membersRes.error;
  const brands = (brandsRes.data ?? []).filter((b) => !esPrueba.has(b.id));
  const conDueno = new Set((membersRes.data ?? []).map((m) => m.brand_id));
  const activas = brands.filter((b) => !b.archived_at);
  const sinDueno = activas.filter((b) => !conDueno.has(b.id));
  const sinSaldo = activas.filter((b) => (b.event_balance ?? 0) === 0 && conDueno.has(b.id));
  const pagoSinTerminar = [...new Set((pagadasRes.data ?? []).map((p) => p.brand_id))]
    .map((id) => brands.find((b) => b.id === id))
    .filter((b): b is NonNullable<typeof b> => !!b && !conDueno.has(b.id));
  const vendidasDeMas = (cuposRes.data ?? []).filter((t) => (t.sold ?? 0) > (t.capacity ?? 0)).length;
  const correosFallidos = correosRes.count ?? 0;
  const yapes = yapeRes.count ?? 0;

  // Eventos a la venta ahora (marcas reales activas, sin terminar).
  const marcaDe = new Map(activas.map((b) => [b.id, b] as const));
  const enVenta = (eventosRes.data ?? [])
    .filter((e) => marcaDe.has(e.brand_id))
    .filter((e) => (e.ends_at ? Date.parse(e.ends_at) : Date.parse(e.starts_at) + 12 * 3600 * 1000) > ahora)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  // Por evento: entradas emitidas, vendidas hoy y cuántos entraron.
  const cuenta = (q: PromiseLike<{ count: number | null; error: unknown }>) => Promise.resolve(q).then((r) => (r.error ? null : r.count ?? 0));
  const numeros = await Promise.all(enVenta.map((e) => Promise.all([
    cuenta(admin.from('tickets').select('id', HEAD).eq('event_id', e.id).is('invalidated_at', null)),
    cuenta(admin.from('tickets').select('id', HEAD).eq('event_id', e.id).is('invalidated_at', null).gte('created_at', new Date(hoy).toISOString())),
    cuenta(admin.from('tickets').select('id', HEAD).eq('event_id', e.id).is('invalidated_at', null).gt('scan_count', 0)),
  ])));

  // Barras: entradas por día de Lima, los últimos 14 días.
  const porDia = new Map<number, number>();
  for (const t of ticketsRes.data) {
    // Medianoche de Lima del día de esa entrada.
    const dia = Math.floor((Date.parse(t.created_at) - LIMA) / DIA) * DIA + LIMA;
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
  }
  const dias = Array.from({ length: 14 }, (_, i) => {
    const t = desde14 + i * DIA;
    const f = new Date(t);
    return {
      etiqueta: new Intl.DateTimeFormat('es-PE', { day: 'numeric', timeZone: 'America/Lima' }).format(f),
      titulo: new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' }).format(f),
      n: porDia.get(t) ?? 0,
      hoy: t === hoy,
    };
  });
  const total14 = dias.reduce((s, d) => s + d.n, 0);

  const pl = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
  const nombres = (list: { name: string }[]) => list.slice(0, 3).map((b) => b.name).join(', ') + (list.length > 3 ? ` y ${list.length - 3} más` : '');
  const tareas: Tarea[] = [];
  if (vendidasDeMas > 0) tareas.push({ grave: true, titulo: `${pl(vendidasDeMas, 'tipo de entrada vendió', 'tipos de entrada vendieron')} más de su cupo`, sub: 'No debería pasar nunca. Revísalo en Salud.', href: '/cabina-7k29x/salud', cta: 'Ver en Salud' });
  if (pagoSinTerminar.length > 0) tareas.push({ titulo: `${pl(pagoSinTerminar.length, 'marca pagó', 'marcas pagaron')} y no terminó su registro`, sub: `${nombres(pagoSinTerminar)} · ya se le envió el link para terminar; si no entra, escríbele.`, href: `/cabina-7k29x/brands/${pagoSinTerminar[0]!.slug}`, cta: 'Ver marca' });
  if (correosFallidos > 0) tareas.push({ titulo: pl(correosFallidos, 'correo no salió', 'correos no salieron'), sub: 'En los últimos 14 días. Puede ser una entrada que no le llegó a alguien.', href: '/cabina-7k29x/salud', cta: 'Ver en Salud' });
  if (sinDueno.length > 0) tareas.push({ titulo: pl(sinDueno.length, 'marca sin dueño', 'marcas sin dueño'), sub: `${nombres(sinDueno)} · nadie puede entrar a su panel.`, href: `/cabina-7k29x/brands/${sinDueno[0]!.slug}`, cta: 'Asignar dueño' });
  if (yapes > 0) tareas.push({ titulo: `${pl(yapes, 'Yape espera', 'Yapes esperan')} que su marca lo revise`, sub: 'Comprobantes subidos que el organizador todavía no aprobó.', href: '/cabina-7k29x/salud', cta: 'Ver en Salud' });
  if (sinSaldo.length > 0) tareas.push({ titulo: `${pl(sinSaldo.length, 'marca se quedó', 'marcas se quedaron')} sin eventos en su pack`, sub: `${nombres(sinSaldo)} · no pueden crear otro evento hasta comprar.`, href: `/cabina-7k29x/brands/${sinSaldo[0]!.slug}#saldo`, cta: 'Ver marca' });
  const [primera, ...resto] = tareas;

  const fecha = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' });
  const cuando = (iso: string) => {
    const t = Date.parse(iso);
    const hora = new Date(t).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Lima' });
    if (t >= hoy && t < hoy + DIA) return `hoy, ${hora}`;
    if (t >= hoy + DIA && t < hoy + 2 * DIA) return `mañana, ${hora}`;
    return new Date(t).toLocaleString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Lima' });
  };
  const num = (n: number | null) => (n === null ? '—' : n.toLocaleString('es-PE'));
  const [destacado, ...otros] = enVenta;
  const [nd, ...nOtros] = numeros;

  return (
    <>
      <div className="s-pagehead">
        <div>
          <h1 className="s-h1">Inicio</h1>
          <p className="s-card__desc">{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</p>
        </div>
      </div>

      {/* 1) LO QUE TE TOCA */}
      {!leido ? (
        <p className="s-notice s-notice--warn" role="status">No se pudo leer el estado de las marcas. Recarga la página en un momento.</p>
      ) : primera ? (
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
        <p className="s-calm s-calm--ok">Todo en orden: nada que te toque resolver.</p>
      )}

      {/* 2) EL EVENTO QUE SE ESTÁ VENDIENDO, en grande (como "el evento que
          viene" del panel del organizador). */}
      {destacado ? (
        <section className="c-next" aria-labelledby="c-next-t">
          <div className="c-next__head">
            <Link href={`/cabina-7k29x/events/${destacado.id}`} className="c-next__flyer" aria-hidden="true" tabIndex={-1}>
              <Flyer url={destacado.cover_url} nombre={destacado.name} ancho={440} />
            </Link>
            <div className="c-next__id">
              <span className="c-next__live"><span className="c-next__dot" aria-hidden="true" />A la venta</span>
              <h2 className="c-next__title" id="c-next-t"><Link href={`/cabina-7k29x/events/${destacado.id}`}>{destacado.name}</Link></h2>
              <span className="c-next__when">{marcaDe.get(destacado.brand_id)!.name} · {cuando(destacado.starts_at)}</span>
            </div>
          </div>
          <Cifras items={[
            { n: num(nd?.[0] ?? null), label: 'entradas' },
            { n: num(nd?.[1] ?? null), label: 'vendidas hoy' },
            { n: num(nd?.[2] ?? null), label: 'ya entraron' },
          ]} />
          {otros.length > 0 && (
            <>
              <p className="s-section-lead c-next__mas">También a la venta</p>
              <ul className="c-evgrid">
                {otros.map((e, i) => (
                  <EventoCard key={e.id} href={`/cabina-7k29x/events/${e.id}`} nombre={e.name} cover={e.cover_url}
                    lineas={[`${marcaDe.get(e.brand_id)!.name} · ${cuando(e.starts_at)}`]}
                    cifra={{ n: nOtros[i]?.[0] ?? null, label: 'entradas' }} />
                ))}
              </ul>
            </>
          )}
        </section>
      ) : (
        <section className="s-section" aria-labelledby="c-nada">
          <h2 className="s-h2 s-h2--sec" id="c-nada">A la venta</h2>
          <p className="s-calm">Ninguna marca tiene un evento a la venta en este momento.</p>
        </section>
      )}

      {/* 3) ENTRADAS POR DÍA */}
      <section className="s-section" aria-labelledby="c-barras-t">
        <h2 className="s-h2 s-h2--sec" id="c-barras-t">Entradas por día</h2>
        <p className="c-sub">{ticketsRes.error ? 'No se pudo leer.' : `${total14.toLocaleString('es-PE')} en los últimos 14 días, en todas las marcas`}</p>
        <Barras dias={dias} />
      </section>

      {/* 4) TUS VENTAS DE PAQUETES */}
      <VentasPacks />

      {/* 5) MARCAS */}
      <section className="s-section" aria-labelledby="c-marcas-t">
        <div className="c-sechead">
          <h2 className="s-h2" id="c-marcas-t">Marcas</h2>
          <Link href="/cabina-7k29x/brands" className="s-textlink">Ver todas</Link>
        </div>
        {activas.length === 0 ? (
          <p className="s-calm">Todavía no hay marcas activas.</p>
        ) : (
          <ul className="c-brandgrid">
            {activas.slice(0, 6).map((b) => {
              const tj = (b.theme_json ?? {}) as { logo_url?: string | null; primary_color?: string };
              const vende = enVenta.some((e) => e.brand_id === b.id);
              const q = b.event_balance ?? 0;
              return (
                <MarcaCard key={b.id} href={`/cabina-7k29x/brands/${b.slug}`} nombre={b.name} logo={tj.logo_url ?? null} color={tj.primary_color ?? null}
                  estado={vende ? 'vendiendo' : 'quieta'} detalle={q === 0 ? 'Sin eventos en su pack' : `Le ${q === 1 ? 'queda 1 evento' : `quedan ${q} eventos`}`}
                  alerta={!conDueno.has(b.id) ? 'Sin dueño' : null} />
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
