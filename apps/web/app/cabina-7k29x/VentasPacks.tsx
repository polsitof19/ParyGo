import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';

// VENTAS DE PAQUETES (2026-09-26, pedido de Paul): cuánto vendió ParyGo hoy,
// en los últimos 7 días y en el mes, cada uno contra el período anterior, y
// las últimas ventas. Solo compras PAGADAS (paid_at) de marcas reales: las de
// prueba (is_test) no suman. Todo en hora de Lima (UTC-5 fijo, sin horario de
// verano). Soles y dólares se suman por separado: no se convierte moneda.
const DIA = 86_400_000;
const LIMA = 5 * 3_600_000;

type Venta = { paid_at: string; pack: number; currency: string; amount_cents: number; provider: string; created_by: string | null; brand: { name: string; slug: string; is_test: boolean } | null };
type Suma = { n: number; eventos: number; pen: number; usd: number };

const usd = (c: number) => `US$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const monto = (s: Suma) => (s.pen > 0 || s.usd === 0 ? formatPEN(s.pen) : usd(s.usd));
const extra = (s: Suma) => (s.pen > 0 && s.usd > 0 ? ` + ${usd(s.usd)}` : '');

function hace(iso: string): string {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} d`;
}

export async function VentasPacks() {
  // Medianoche de Lima de hoy, en milisegundos UTC.
  const l = new Date(Date.now() - LIMA);
  const hoy = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) + LIMA;
  const mes = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1) + LIMA;
  const mesPasado = Date.UTC(l.getUTCFullYear(), l.getUTCMonth() - 1, 1) + LIMA;
  const semana = hoy - 6 * DIA; // 7 días contando hoy
  const desde = Math.min(mesPasado, semana - 7 * DIA);

  const { data } = await createAdminClient()
    .from('pack_purchases')
    .select('paid_at, pack, currency, amount_cents, provider, created_by, brand:brands ( name, slug, is_test )')
    .eq('status', 'paid')
    .gte('paid_at', new Date(desde).toISOString())
    .order('paid_at', { ascending: false });
  const ventas = ((data ?? []) as unknown as Venta[]).filter((v) => v.brand && !v.brand.is_test);

  const sumar = (a: number, b: number): Suma => {
    const s: Suma = { n: 0, eventos: 0, pen: 0, usd: 0 };
    for (const v of ventas) {
      const t = Date.parse(v.paid_at);
      if (t < a || t >= b) continue;
      s.n += 1;
      s.eventos += v.pack;
      if (v.currency === 'USD') s.usd += v.amount_cents; else s.pen += v.amount_cents;
    }
    return s;
  };
  const fin = Date.now() + 1;
  const nombreMes = new Date().toLocaleDateString('es-PE', { month: 'long', timeZone: 'America/Lima' });
  // El mes primero: es la cifra que dice cómo va el negocio; hoy y la
  // semana la matizan.
  const periodos = [
    { label: `Este mes (${nombreMes})`, s: sumar(mes, fin), antes: sumar(mesPasado, mes), vs: 'mes pasado' },
    { label: 'Hoy', s: sumar(hoy, fin), antes: sumar(hoy - DIA, hoy), vs: 'ayer' },
    { label: 'Últimos 7 días', s: sumar(semana, fin), antes: sumar(semana - 7 * DIA, semana), vs: '7 días anteriores' },
  ];
  // Sin ninguna venta en todo lo que se mira: una línea, no doce ceros.
  const nada = ventas.length === 0;
  const ultimas = ventas.slice(0, 5);

  return (
    <section className="s-section" aria-labelledby="ventas-packs">
      <h2 className="s-h2 s-h2--sec" id="ventas-packs">Paquetes vendidos</h2>
      {nada ? (
        <p className="s-calm">Todavía no vendiste ningún paquete. Cuando una marca compre, aparece acá y te llega un correo.</p>
      ) : (
      <>
      <div className="s-stats">
        {periodos.map((p) => (
          <div key={p.label} className="s-stat">
            <span className="s-stat__label">{p.label}</span>
            <span className="s-stat__value s-stat__value--money">{monto(p.s)}{extra(p.s)}</span>
            <span className="s-stat__sub">
              {p.s.n} venta{p.s.n === 1 ? '' : 's'} · {p.s.eventos} evento{p.s.eventos === 1 ? '' : 's'}
            </span>
            <span className="s-stat__hint">{p.vs}: {monto(p.antes)}{extra(p.antes)}</span>
          </div>
        ))}
      </div>
      <p className="s-section-lead">Últimas ventas</p>
      <ul className="s-event-list">
        {ultimas.map((v) => (
          <li key={v.paid_at + v.brand!.slug} className="s-event-row">
            <Link href={`/cabina-7k29x/brands/${v.brand!.slug}`} className="s-event-row__main">
              <span className="s-event-row__name">{v.brand!.name} · {v.pack} evento{v.pack === 1 ? '' : 's'}</span>
              <span className="s-event-row__date">{hace(v.paid_at)} · {v.provider === 'paypal' ? 'PayPal' : 'Mercado Pago'} · {v.created_by ? 'volvió a comprar' : 'marca nueva'}</span>
            </Link>
            <span className="s-evcount">{v.currency === 'USD' ? usd(v.amount_cents) : formatPEN(v.amount_cents)}</span>
          </li>
        ))}
      </ul>
      </>
      )}
    </section>
  );
}
