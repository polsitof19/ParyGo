import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { mpListo, paypalListo } from '@/lib/cobroParygo';
import { PACK_PRIVADO, PACKS } from '@/lib/packs';
import { EmpezarFlow, type Plan } from './EmpezarFlow';
import { TipoDeEvento } from './TipoDeEvento';
import { esLang, esMoneda, type Moneda } from './textos';

export const dynamic = 'force-dynamic';

type Params = { pack?: string; cancelado?: string; lang?: string; moneda?: string; tipo?: string };

export function generateMetadata({ searchParams }: { searchParams: Params }): Metadata {
  return esLang(searchParams.lang) === 'en'
    ? { title: 'Create your brand · ParyGo', description: 'Choose your package and get your yourbrand.parygo.com page ready to sell tickets.' }
    : { title: 'Crea tu marca · ParyGo', description: 'Elige tu paquete y ten tu página tumarca.parygo.com lista para vender entradas.' };
}

// Sin prueba gratis (Paul, 2026-09-26: "mejor que compren directo").
const PLANES = ['1', '3', '5', '10'] as const;

export default function EmpezarPage({ searchParams }: { searchParams: Params }) {
  const lang = esLang(searchParams.lang);

  // Primero la pregunta "¿Qué vas a organizar?" (Paul, 2026-09-28). La vuelta
  // de un pago cancelado (cancelado=1, la arma pagarAlta) ya eligió marca: va
  // directo al formulario con su aviso, sin volver a preguntar.
  const tipo = searchParams.tipo === 'privado' ? 'privado'
    : searchParams.tipo === 'marca' || searchParams.cancelado === '1' ? 'marca'
    : null;
  // pack/moneda/lang de la landing viajan por la pregunta hasta el formulario.
  const qs = new URLSearchParams();
  for (const k of ['pack', 'moneda', 'lang'] as const) {
    const v = searchParams[k];
    if (typeof v === 'string' && v) qs.set(k, v);
  }
  if (!tipo) return <TipoDeEvento lang={lang} qs={qs} />;

  // Moneda: la que vio en la landing (?moneda=) manda; si llega directo, en
  // inglés dólares y en español según el país (Cloudflare manda cf-ipcountry).
  const pais = headers().get('cf-ipcountry')?.toUpperCase() ?? '';
  const moneda: Moneda = esMoneda(searchParams.moneda) ?? (lang === 'en' ? 'USD' : pais && pais !== 'PE' ? 'USD' : 'PEN');
  const pedido = PLANES.find((p) => p === searchParams.pack) ?? '1';

  // Los precios salen de lib/packs.ts, la misma fuente que cobra el servidor:
  // la pantalla solo los muestra, el monto lo fija iniciarCompraPack (según
  // brands.tipo). El evento privado (0075) es un solo plan.
  const planes: Plan[] = tipo === 'privado'
    ? [{ id: '1', eventos: 1, PEN: PACK_PRIVADO.pen, USD: PACK_PRIVADO.usd }]
    : PACKS.map((p) => ({
      id: String(p.eventos) as Plan['id'],
      eventos: p.eventos,
      PEN: p.pen,
      USD: p.usd,
      destacado: p.eventos === 3,
    }));

  return (
    <EmpezarFlow
      lang={lang}
      tipo={tipo}
      planes={planes}
      inicial={tipo === 'privado' ? '1' : pedido}
      monedaInicial={moneda}
      disponible={{ PEN: mpListo(), USD: paypalListo() }}
      cancelado={searchParams.cancelado === '1'}
    />
  );
}
