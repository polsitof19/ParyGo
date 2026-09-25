'use client';

import { precio, useMoneda } from '@/lib/precios';

// Un precio en la moneda del visitante (soles en Perú, dólares afuera).
export function PrecioLocal({ pen, usd }: { pen: number; usd: number }) {
  const m = useMoneda();
  return <>{precio(m === 'PEN' ? pen : usd, m)}</>;
}
