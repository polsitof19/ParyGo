'use client';

import { precio, useMoneda } from '@/lib/precios';

// Un precio en la moneda del visitante (en inglés dólares; en español, soles
// en Perú y dólares afuera).
export function PrecioLocal({ pen, usd, lang }: { pen: number; usd: number; lang: 'es' | 'en' }) {
  const m = useMoneda(lang);
  return <>{precio(m === 'PEN' ? pen : usd, m)}</>;
}
