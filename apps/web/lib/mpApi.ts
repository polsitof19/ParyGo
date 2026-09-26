// =============================================================
// Cliente mínimo de la API de MercadoPago con fetch (edge-safe).
// =============================================================
// NO usar el SDK `mercadopago` en el server: arma su User-Agent con
// process.version.substring(...) y en el edge (Cloudflare y el sandbox edge de
// Next) process.version no existe → "Cannot read properties of undefined
// (reading 'substring')". Resultado medido el 2026-09-25: NINGUNA preferencia
// se creaba en producción (compra de packs y cobro con tarjeta de entradas).
// Solo se usan dos endpoints; con fetch alcanza.

const BASE = 'https://api.mercadopago.com';

export type MpPago = {
  id?: number | string;
  status?: string;
  external_reference?: string | null;
  transaction_amount?: number;
  currency_id?: string;
  metadata?: { brand_id?: string; [k: string]: unknown } | null;
};

async function mp<T>(token: string, path: string, init?: { method?: string; body?: unknown; idempotencyKey?: string }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.idempotencyKey ? { 'X-Idempotency-Key': init.idempotencyKey } : {}),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    // Nunca el token: solo el status y el mensaje de MP.
    const t = await res.text().catch(() => '');
    throw new Error(`mp_${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// Checkout Pro. idempotencyKey = la compra/orden: un reintento no crea dos.
export async function mpCrearPreferenciaApi(token: string, body: Record<string, unknown>, idempotencyKey: string): Promise<{ id: string; initPoint: string }> {
  const r = await mp<{ id?: string; init_point?: string }>(token, '/checkout/preferences', { method: 'POST', body, idempotencyKey });
  if (!r.id || !r.init_point) throw new Error('MercadoPago no devolvió la preferencia');
  return { id: r.id, initPoint: r.init_point };
}

export function mpLeerPago(token: string, paymentId: string): Promise<MpPago> {
  if (!/^\d{1,20}$/.test(paymentId)) return Promise.reject(new Error('payment_id inválido'));
  return mp<MpPago>(token, `/v1/payments/${paymentId}`);
}
