// Paquetes de eventos y sus precios (Paul, 2026-09-24). ÚNICA fuente: el
// server congela el monto en pack_purchases al crear la compra y
// settle_pack_purchase lo contrasta contra lo que confirma la pasarela. El
// navegador solo manda qué paquete y qué pasarela, nunca un monto.
export type Pasarela = 'mercadopago' | 'paypal';

export const PACKS = [
  { eventos: 1, pen: 15000, usd: 5900 },
  { eventos: 3, pen: 39000, usd: 14900 },
  { eventos: 5, pen: 60000, usd: 22900 },
  { eventos: 10, pen: 110000, usd: 39900 },
] as const;

export type Pack = (typeof PACKS)[number];

export function packDe(eventos: number): Pack | null {
  return PACKS.find((p) => p.eventos === eventos) ?? null;
}

export function precioDe(p: Pack, pasarela: Pasarela): { currency: 'PEN' | 'USD'; cents: number } {
  return pasarela === 'mercadopago' ? { currency: 'PEN', cents: p.pen } : { currency: 'USD', cents: p.usd };
}

export const fmtUSD = (cents: number) => `USD ${cents % 100 ? (cents / 100).toFixed(2) : cents / 100}`;
