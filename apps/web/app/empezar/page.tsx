import { mpListo } from '@/lib/cobroParygo';
import { PACKS } from '@/lib/packs';
import { PRUEBA_TOPE_ENTRADAS } from '@/lib/prueba';
import { EmpezarFlow, type Plan } from './EmpezarFlow';

export const dynamic = 'force-dynamic';

const PLANES = ['prueba', '1', '3', '5', '10'] as const;

export default function EmpezarPage({ searchParams }: { searchParams: { pack?: string } }) {
  const pedido = PLANES.find((p) => p === searchParams.pack) ?? 'prueba';
  const pagos = mpListo();

  // Los precios salen de lib/packs.ts, la misma fuente que cobra el servidor:
  // la pantalla solo los muestra, el monto lo fija confirmarAlta.
  const planes: Plan[] = [
    { id: 'prueba', nombre: 'Prueba gratis', detalle: `1 evento, hasta ${PRUEBA_TOPE_ENTRADAS} entradas. Sin tarjeta.`, precio: null, porEvento: null, eventos: 1 },
    ...PACKS.map((p) => ({
      id: String(p.eventos) as Plan['id'],
      nombre: `${p.eventos} evento${p.eventos === 1 ? '' : 's'}`,
      detalle: p.eventos === 1 ? 'Para un evento puntual.' : `S/${(p.pen / p.eventos / 100).toLocaleString('es-PE')} por evento.`,
      precio: p.pen,
      porEvento: p.pen / p.eventos,
      eventos: p.eventos,
      destacado: p.eventos === 3,
    })),
  ];

  return <EmpezarFlow planes={planes} inicial={pagos || pedido === 'prueba' ? pedido : 'prueba'} pagos={pagos} tope={PRUEBA_TOPE_ENTRADAS} />;
}
