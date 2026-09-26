import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { idsMarcasDePrueba, sinMarcasDePrueba, soloConComprobante } from '@/lib/marcasDePrueba';
import { VentasPacks } from './VentasPacks';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// INICIO de la cabina (2026-09-26, rediseño pedido por Paul: "para entenderlo
// yo"). Responde dos preguntas en este orden, en palabras de dueño:
//   1. ¿Qué me toca hacer?   → "Por resolver" (una fila con fondo, la más
//      urgente, con el ÚNICO primario; el resto en líneas con punto). Si no
//      hay nada, una línea: "Todo en orden".
//   2. ¿Cómo va el negocio?  → paquetes vendidos (la plata de ParyGo), los
//      eventos que se están vendiendo ahora con sus ENTRADAS (la plata de las
//      entradas es de cada marca: acá se cuentan entradas, no soles) y un
//      resumen de marcas.
// Todo sin marcas de prueba (is_test). Una consulta que falla NO se muestra
// como cero: se dice que no se pudo leer.
// =============================================================

type Tarea = { n: number; titulo: string; sub: string; href: string; cta: string; grave?: boolean };

export default async function Inicio() {
  const admin = createAdminClient();
  const prueba = await idsMarcasDePrueba(admin);
  const esPrueba = new Set(prueba);
  const HEAD = { count: 'exact' as const, head: true };
  const hace14d = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const ahora = Date.now();

  const [brandsRes, membersRes, yapeRes, pagadasRes, correosRes, cuposRes, eventosRes] = await Promise.all([
    admin.from('brands').select('id, name, slug, event_balance, archived_at'),
    admin.from('brand_members').select('brand_id').eq('role', 'brand_admin'),
    soloConComprobante(sinMarcasDePrueba(admin.from('orders').select('id', HEAD).eq('status', 'pending_yape_review'), prueba)),
    // Altas que pagaron su paquete: si la marca sigue sin dueño, la persona
    // pagó y no terminó de crear su cuenta.
    admin.from('pack_purchases').select('brand_id').eq('status', 'paid').is('created_by', null),
    admin.from('notification_jobs').select('id', HEAD).in('status', ['failed', 'error']).gte('created_at', hace14d),
    admin.from('ticket_types').select('sold, capacity, event_id').eq('is_unlimited', false),
    admin.from('events').select('id, name, slug, starts_at, ends_at, brand_id, is_published, archived_at').eq('is_published', true).is('archived_at', null),
  ]);

  const leido = !brandsRes.error && !membersRes.error;
  const brands = (brandsRes.data ?? []).filter((b) => !esPrueba.has(b.id));
  const conDueno = new Set((membersRes.data ?? []).map((m) => m.brand_id));
  const activas = brands.filter((b) => !b.archived_at);
  const archivadas = brands.length - activas.length;
  const sinDueno = activas.filter((b) => !conDueno.has(b.id));
  const sinSaldo = activas.filter((b) => (b.event_balance ?? 0) === 0 && conDueno.has(b.id));
  const pagoSinTerminar = [...new Set((pagadasRes.data ?? []).map((p) => p.brand_id))]
    .map((id) => brands.find((b) => b.id === id))
    .filter((b): b is NonNullable<typeof b> => !!b && !conDueno.has(b.id));
  const vendidasDeMas = (cuposRes.data ?? []).filter((t) => (t.sold ?? 0) > (t.capacity ?? 0)).length;
  const correosFallidos = correosRes.count ?? 0;
  const yapes = yapeRes.count ?? 0;

  // Eventos a la venta AHORA: publicados, de marcas reales activas, y que no
  // terminaron (sin hora de fin, se dan 12 h desde el inicio).
  const marcaDe = new Map(activas.map((b) => [b.id, b] as const));
  const enVenta = (eventosRes.data ?? [])
    .filter((e) => marcaDe.has(e.brand_id))
    .filter((e) => (e.ends_at ? Date.parse(e.ends_at) : Date.parse(e.starts_at) + 12 * 3600 * 1000) > ahora)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  // Entradas emitidas (no anuladas) por evento: un conteo por evento, son pocos.
  const entradas = await Promise.all(
    enVenta.map((e) => admin.from('tickets').select('id', HEAD).eq('event_id', e.id).is('invalidated_at', null).then((r) => (r.error ? null : r.count ?? 0))),
  );

  const pl = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
  const nombres = (list: { name: string }[]) => list.slice(0, 3).map((b) => b.name).join(', ') + (list.length > 3 ? ` y ${list.length - 3} más` : '');

  // Lo que le toca a Paul, de lo más grave a lo menos. La primera es la fila
  // con fondo y el único botón primario de la pantalla.
  const tareas: Tarea[] = [];
  if (vendidasDeMas > 0) tareas.push({ n: vendidasDeMas, grave: true, titulo: `${pl(vendidasDeMas, 'tipo de entrada vendió', 'tipos de entrada vendieron')} más de su cupo`, sub: 'No debería pasar nunca. Revísalo en Salud.', href: '/cabina-7k29x/salud', cta: 'Ver en Salud' });
  if (pagoSinTerminar.length > 0) tareas.push({ n: pagoSinTerminar.length, titulo: `${pl(pagoSinTerminar.length, 'marca pagó', 'marcas pagaron')} y no terminó su registro`, sub: `${nombres(pagoSinTerminar)} · ya se le envió el link para terminar; si no entra, escríbele.`, href: `/cabina-7k29x/brands/${pagoSinTerminar[0]!.slug}`, cta: 'Ver marca' });
  if (correosFallidos > 0) tareas.push({ n: correosFallidos, titulo: `${pl(correosFallidos, 'correo no salió', 'correos no salieron')}`, sub: 'En los últimos 14 días. Puede ser una entrada que no le llegó a alguien.', href: '/cabina-7k29x/salud', cta: 'Ver en Salud' });
  if (sinDueno.length > 0) tareas.push({ n: sinDueno.length, titulo: `${pl(sinDueno.length, 'marca sin dueño', 'marcas sin dueño')}`, sub: `${nombres(sinDueno)} · nadie puede entrar a su panel.`, href: `/cabina-7k29x/brands/${sinDueno[0]!.slug}`, cta: 'Asignar dueño' });
  if (yapes > 0) tareas.push({ n: yapes, titulo: `${pl(yapes, 'Yape espera', 'Yapes esperan')} que su marca lo revise`, sub: 'Comprobantes subidos que el organizador todavía no aprobó.', href: '/cabina-7k29x/salud', cta: 'Ver en Salud' });
  if (sinSaldo.length > 0) tareas.push({ n: sinSaldo.length, titulo: `${pl(sinSaldo.length, 'marca se quedó', 'marcas se quedaron')} sin eventos en su pack`, sub: `${nombres(sinSaldo)} · no pueden crear otro evento hasta comprar.`, href: `/cabina-7k29x/brands/${sinSaldo[0]!.slug}#saldo`, cta: 'Ver marca' });
  const [primera, ...resto] = tareas;

  const hoy = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' });
  const cuando = (iso: string) => new Date(iso).toLocaleString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Lima' });

  return (
    <>
      <div className="s-pagehead">
        <div>
          <h1 className="s-h1">Inicio</h1>
          <p className="s-card__desc">{hoy.charAt(0).toUpperCase() + hoy.slice(1)}</p>
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

      {/* 2) PAQUETES VENDIDOS: la plata de ParyGo. */}
      <VentasPacks />

      {/* 3) EVENTOS A LA VENTA AHORA: entradas, no soles (esa plata es de cada marca). */}
      <section className="s-section" aria-labelledby="en-venta">
        <h2 className="s-h2 s-h2--sec" id="en-venta">Eventos a la venta ahora</h2>
        {enVenta.length === 0 ? (
          <p className="s-calm">Ninguna marca tiene un evento a la venta en este momento.</p>
        ) : (
          <ul className="s-event-list">
            {enVenta.map((e, i) => {
              const m = marcaDe.get(e.brand_id)!;
              const n = entradas[i] ?? null;
              return (
                <li key={e.id} className="s-event-row">
                  <Link href={`/cabina-7k29x/events/${e.id}`} className="s-event-row__main">
                    <span className="s-event-row__name">{e.name}</span>
                    <span className="s-event-row__date">{m.name} · {cuando(e.starts_at)}</span>
                  </Link>
                  <span className="s-evcount">
                    {n === null ? '—' : n.toLocaleString('es-PE')}
                    <span>{n === 1 ? 'entrada' : 'entradas'}</span>
                  </span>
                  <ChevronRight className="s-event-row__chev" aria-hidden="true" />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 4) MARCAS, en una línea. */}
      <section className="s-section" aria-labelledby="marcas-res">
        <h2 className="s-h2 s-h2--sec" id="marcas-res">Marcas</h2>
        <Link href="/cabina-7k29x/brands" className="s-linkrow">
          <span>
            <strong>{pl(activas.length, 'marca activa', 'marcas activas')}</strong>
            <span className="s-todo__sub">
              {pl(enVenta.length ? new Set(enVenta.map((e) => e.brand_id)).size : 0, 'vendiendo ahora', 'vendiendo ahora')}
              {archivadas > 0 && <> · {pl(archivadas, 'archivada', 'archivadas')}</>}
            </span>
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}
