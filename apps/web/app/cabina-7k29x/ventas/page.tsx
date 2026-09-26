import { createAdminClient } from '@/lib/supabase/admin';
import { todas } from '@/lib/todas';
import { idsMarcasDePrueba, sinMarcasDePrueba } from '@/lib/marcasDePrueba';
import { VentasPacks } from '../VentasPacks';
import { Barras } from '../visual';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// VENTAS (tercera pestaña de la cabina, 2026-09-26). Dos cosas distintas:
//   1. Tus ventas de paquetes: la plata de ParyGo (hoy · 7 días · mes, cada una
//      contra el período anterior, y las últimas ventas).
//   2. Entradas por día en toda la plataforma: cuánto se mueve, en barras.
//      Son entradas, no soles: esa plata es de cada marca.
// Sin marcas de prueba. Hora de Lima (UTC-5 fijo).
// =============================================================

const DIA = 86_400_000;
const LIMA = 5 * 3_600_000;

export default async function VentasPage() {
  const admin = createAdminClient();
  const prueba = await idsMarcasDePrueba(admin);
  const l = new Date(Date.now() - LIMA);
  const hoy = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) + LIMA; // medianoche de Lima
  const desde = hoy - 29 * DIA; // 30 días contando hoy

  const tickets = await todas((a, b) => sinMarcasDePrueba(
    admin.from('tickets').select('created_at').is('invalidated_at', null).gte('created_at', new Date(desde).toISOString()),
    prueba,
  ).order('id').range(a, b))
    .then((data) => ({ data: data as { created_at: string }[], error: null }), (error: Error) => ({ data: [] as { created_at: string }[], error }));

  const porDia = new Map<number, number>();
  for (const t of tickets.data) {
    const dia = Math.floor((Date.parse(t.created_at) - LIMA) / DIA) * DIA + LIMA; // medianoche de Lima de ese día
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
  }
  const serie = (n: number) => Array.from({ length: n }, (_, i) => {
    const t = hoy - (n - 1 - i) * DIA;
    const f = new Date(t);
    return {
      etiqueta: new Intl.DateTimeFormat('es-PE', { day: 'numeric', timeZone: 'America/Lima' }).format(f),
      titulo: new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' }).format(f),
      n: porDia.get(t) ?? 0,
      hoy: t === hoy,
    };
  });
  const dias14 = serie(14);
  const total = (d: { n: number }[]) => d.reduce((s, x) => s + x.n, 0);
  const hoyN = porDia.get(hoy) ?? 0;
  const semana = total(serie(7));
  const mes = total(serie(30));
  const num = (n: number) => (tickets.error ? '—' : n.toLocaleString('es-PE'));

  return (
    <>
      <div className="s-pagehead">
        <div>
          <h1 className="s-h1">Ventas</h1>
          <p className="s-card__desc">Lo que vendió ParyGo y cuántas entradas se mueven en la plataforma.</p>
        </div>
      </div>

      {/* 1) Tus ventas de paquetes (la plata de ParyGo). */}
      <VentasPacks />

      {/* 2) Entradas en toda la plataforma. */}
      <section className="s-section" aria-labelledby="v-entradas">
        <h2 className="s-h2 s-h2--sec" id="v-entradas">Entradas en todas las marcas</h2>
        <div className="c-cifras c-cifras--dinero">
          <div className="c-cifras__item"><b>{num(hoyN)}</b><span>hoy</span></div>
          <div className="c-cifras__item"><b>{num(semana)}</b><span>últimos 7 días</span></div>
          <div className="c-cifras__item"><b>{num(mes)}</b><span>últimos 30 días</span></div>
        </div>
        <p className="s-section-lead c-barras__lead">Por día, últimos 14 días</p>
        <Barras dias={dias14} />
      </section>
    </>
  );
}
