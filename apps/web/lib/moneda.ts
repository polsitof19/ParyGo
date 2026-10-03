// Moneda de las ENTRADAS de una marca (brands.moneda, 0088). Los importes se
// guardan siempre como enteros ×100 de esa moneda, también CLP y COP (que en la
// práctica no usan decimales): así ningún cálculo cambia, solo cómo se muestra
// y qué se acepta al escribir un precio. Los packs de ParyGo NO usan esto.

export const MONEDAS = ['PEN', 'USD', 'COP', 'MXN', 'CLP', 'ARS', 'EUR'] as const;
export type Moneda = (typeof MONEDAS)[number];

const LOCALE: Record<Moneda, string> = {
  PEN: 'es-PE', USD: 'en-US', COP: 'es-CO', MXN: 'es-MX', CLP: 'es-CL', ARS: 'es-AR', EUR: 'es-ES',
};

// Sin centavos: un precio en estas monedas es siempre entero.
export const sinDecimales = (m: Moneda) => m === 'CLP' || m === 'COP';

export const esMoneda = (v: unknown): v is Moneda => typeof v === 'string' && (MONEDAS as readonly string[]).includes(v);

// Lo que llega de la base (text) → Moneda; cualquier cosa rara cae en PEN, que
// es el default de la columna.
export const monedaDe = (v: unknown): Moneda => (esMoneda(v) ? v : 'PEN');

// 4000 → "S/40" · 4050 → "S/40.50" · COP 5000000 → "$ 50.000".
export function formatMoney(cents: number, moneda: Moneda): string {
  const n = cents / 100;
  const dec = sinDecimales(moneda) || n % 1 === 0 ? 0 : 2;
  return new Intl.NumberFormat(LOCALE[moneda], {
    style: 'currency', currency: moneda, minimumFractionDigits: dec, maximumFractionDigits: dec,
  }).format(n);
}

// El símbolo solo, para la etiqueta de un campo de precio ("Precio (S/)").
export function simbolo(moneda: Moneda): string {
  return new Intl.NumberFormat(LOCALE[moneda], { style: 'currency', currency: moneda })
    .formatToParts(0).find((p) => p.type === 'currency')?.value ?? moneda;
}

// "40" / "40.50" / 40 → centavos. Tira con negativo o no numérico. En CLP/COP
// el punto es separador de MILES ("50.000" = cincuenta mil, no 50) y no hay
// decimales: se aceptan "50000", "50.000", "50,000" o "50 000"; "50.5" tira
// (no se puede cobrar COP 0,50 ni adivinar). En las demás, Number() de siempre
// ("1,000" tira en vez de leerse como 1).
export function aCentavos(input: string | number, moneda: Moneda): number {
  let n: number;
  if (typeof input === 'number') n = input;
  else if (sinDecimales(moneda)) {
    const t = input.trim();
    n = /^\d+$/.test(t) || /^\d{1,3}([.,\s]\d{3})+$/.test(t) ? Number(t.replace(/[.,\s]/g, '')) : NaN;
  } else n = Number(input.trim());
  if (!Number.isFinite(n) || n < 0) throw new Error(`Monto inválido: ${input}`);
  if (sinDecimales(moneda) && !Number.isInteger(n)) throw new Error(`En ${moneda} el monto va sin decimales: ${input}`);
  return Math.round(n * 100);
}

// Importe ya en centavos (el asistente de eventos manda JSON): entero, no
// negativo y, en CLP/COP, múltiplo de 100 (sin fracción de peso).
export const centavosValidos = (c: unknown, moneda: Moneda): boolean =>
  typeof c === 'number' && Number.isInteger(c) && c >= 0 && (!sinDecimales(moneda) || c % 100 === 0);
