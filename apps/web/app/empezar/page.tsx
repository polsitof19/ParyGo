import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { mpListo, paypalListo } from '@/lib/cobroParygo';
import { PACKS } from '@/lib/packs';
import { PRUEBA_TOPE_ENTRADAS } from '@/lib/prueba';
import { EmpezarFlow, type Plan } from './EmpezarFlow';
import { esLang, esMoneda, type Moneda } from './textos';

export const dynamic = 'force-dynamic';

type Params = { pack?: string; cancelado?: string; lang?: string; moneda?: string };

export function generateMetadata({ searchParams }: { searchParams: Params }): Metadata {
  return esLang(searchParams.lang) === 'en'
    ? { title: 'Create your brand · ParyGo', description: 'Choose a package or start with the free trial and get your yourbrand.parygo.com page ready to sell tickets.' }
    : { title: 'Crea tu marca · ParyGo', description: 'Elige tu paquete o comienza con la prueba gratuita y ten tu página tumarca.parygo.com lista para vender entradas.' };
}

const PLANES = ['prueba', '1', '3', '5', '10'] as const;

export default function EmpezarPage({ searchParams }: { searchParams: Params }) {
  const lang = esLang(searchParams.lang);
  // Moneda: la que vio en la landing (?moneda=) manda; si llega directo, en
  // inglés dólares y en español según el país (Cloudflare manda cf-ipcountry).
  const pais = headers().get('cf-ipcountry')?.toUpperCase() ?? '';
  const moneda: Moneda = esMoneda(searchParams.moneda) ?? (lang === 'en' ? 'USD' : pais && pais !== 'PE' ? 'USD' : 'PEN');
  const pedido = PLANES.find((p) => p === searchParams.pack) ?? 'prueba';

  // Los precios salen de lib/packs.ts, la misma fuente que cobra el servidor:
  // la pantalla solo los muestra, el monto lo fija pagarAlta.
  const planes: Plan[] = PACKS.map((p) => ({
    id: String(p.eventos) as Plan['id'],
    eventos: p.eventos,
    PEN: p.pen,
    USD: p.usd,
    destacado: p.eventos === 3,
  }));

  return (
    <EmpezarFlow
      lang={lang}
      planes={planes}
      inicial={pedido}
      monedaInicial={moneda}
      disponible={{ PEN: mpListo(), USD: paypalListo() }}
      tope={PRUEBA_TOPE_ENTRADAS}
      cancelado={searchParams.cancelado === '1'}
    />
  );
}
