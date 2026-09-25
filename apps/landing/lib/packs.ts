// Precios de los packs = apps/web/lib/packs.ts (lo que cobra el sistema).
// Son dos apps separadas: si cambias uno, cambia el otro. Perú ve soles (se
// cobra en soles con Mercado Pago); el resto del mundo ve dólares.
// Sin 'use client' a propósito: lo leen también componentes de servidor
// (StructuredData).
export const PACKS = [
  { eventos: 1, pen: 150, usd: 45 },
  { eventos: 3, pen: 390, usd: 115 },
  { eventos: 5, pen: 600, usd: 175 },
  { eventos: 10, pen: 1100, usd: 320 },
] as const;
