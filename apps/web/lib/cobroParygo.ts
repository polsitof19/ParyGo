import { mpCrearPreferenciaApi, mpLeerPago } from '@/lib/mpApi';

// =============================================================
// Cobro de ParyGo (paquetes de eventos) — NO el de las entradas.
// =============================================================
// Las entradas se cobran con las credenciales de CADA promotor
// (lib/mercadopago.ts). Esto cobra el servicio de ParyGo con las cuentas de
// Paul: MercadoPago en soles (Perú) y PayPal en dólares (afuera).
// Credenciales por variables de entorno del server; sin ellas, la pasarela
// figura como "no disponible" y no se crea ninguna compra.
//   PARYGO_MP_ACCESS_TOKEN, PARYGO_MP_WEBHOOK_SECRET
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV ('live' | 'sandbox')

const env = (k: string) => process.env[k]?.trim() || null;

export const mpListo = () => Boolean(env('PARYGO_MP_ACCESS_TOKEN') && env('PARYGO_MP_WEBHOOK_SECRET'));
export const paypalListo = () => Boolean(env('PAYPAL_CLIENT_ID') && env('PAYPAL_CLIENT_SECRET'));
export const mpWebhookSecret = () => env('PARYGO_MP_WEBHOOK_SECRET');

function mpToken(): string {
  const accessToken = env('PARYGO_MP_ACCESS_TOKEN');
  if (!accessToken) throw new Error('mp_no_configurado');
  return accessToken;
}

export async function mpCrearPreferencia(i: {
  compraId: string; titulo: string; soles: number; email: string | null;
  exito: string; fallo: string;
}): Promise<{ id: string; initPoint: string }> {
  // SIN notification_url: la de la preferencia tiene prioridad sobre la de "Tus
  // integraciones", y la firma con la clave secreta (x-signature) es de esa
  // configuración del panel. El webhook se configura allá:
  // https://app.parygo.com/api/webhooks/parygo-mp, evento Pagos.
  return mpCrearPreferenciaApi(mpToken(), {
    items: [{ id: i.compraId, title: i.titulo, quantity: 1, unit_price: i.soles, currency_id: 'PEN' }],
    ...(i.email ? { payer: { email: i.email } } : {}),
    back_urls: { success: i.exito, failure: i.fallo, pending: i.exito },
    auto_return: 'approved',
    external_reference: i.compraId,
    statement_descriptor: 'PARYGO',
    metadata: { compra_id: i.compraId, tipo: 'pack_eventos' },
  }, i.compraId);
}

export async function mpPago(paymentId: string) {
  return mpLeerPago(mpToken(), paymentId);
}

// ---------------- PayPal (REST Orders v2, con fetch: corre en edge) ----------
const paypalBase = () => (env('PAYPAL_ENV') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');

async function paypalToken(): Promise<string> {
  const id = env('PAYPAL_CLIENT_ID');
  const secret = env('PAYPAL_CLIENT_SECRET');
  if (!id || !secret) throw new Error('paypal_no_configurado');
  const r = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const j = (await r.json()) as { access_token?: string };
  if (!r.ok || !j.access_token) throw new Error(`paypal_token_${r.status}`);
  return j.access_token;
}

type PaypalCaptura = { id?: string; status?: string; amount?: { currency_code?: string; value?: string }; custom_id?: string };
type PaypalOrden = {
  id?: string; status?: string;
  links?: { rel: string; href: string }[];
  purchase_units?: { custom_id?: string; payments?: { captures?: PaypalCaptura[] } }[];
  details?: { issue?: string }[];
};

export async function paypalCrearOrden(i: { compraId: string; titulo: string; usd: string; volver: string; cancelar: string }): Promise<{ id: string; aprobar: string }> {
  const r = await fetch(`${paypalBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await paypalToken()}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `crear-${i.compraId}` },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ reference_id: i.compraId, custom_id: i.compraId, description: i.titulo, amount: { currency_code: 'USD', value: i.usd } }],
      payment_source: { paypal: { experience_context: { brand_name: 'ParyGo', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW', return_url: i.volver, cancel_url: i.cancelar } } },
    }),
  });
  const j = (await r.json()) as PaypalOrden;
  const aprobar = j.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  if (!r.ok || !j.id || !aprobar) throw new Error(`paypal_crear_${r.status}`);
  return { id: j.id, aprobar };
}

// Cobra la orden aprobada (la plata se mueve ACÁ, no antes). Idempotente: si
// ya estaba cobrada, se lee la captura existente. Devuelve la captura
// COMPLETED o null.
// `rechazado`: PayPal dijo que NO (tarjeta rechazada, orden no aprobada o
// vencida). Reintentar la misma orden no sirve: el que llama marca la compra
// como fallida para que el comprador vuelva a empezar (security review).
const RECHAZOS = new Set(['INSTRUMENT_DECLINED', 'ORDER_NOT_APPROVED', 'ORDER_EXPIRED', 'PAYER_ACTION_REQUIRED', 'TRANSACTION_REFUSED', 'PAYER_CANNOT_PAY']);

export async function paypalCobrar(ordenId: string, compraId: string): Promise<{ captura: PaypalCaptura | null; rechazado: boolean }> {
  const token = await paypalToken();
  const r = await fetch(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(ordenId)}/capture`, {
    method: 'POST',
    // Idempotencia por ORDEN: con el id de la compra, un reintento tras un
    // rechazo podía recibir de PayPal la misma respuesta guardada.
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `cobrar-${ordenId}` },
  });
  let j = (await r.json()) as PaypalOrden;
  if (!r.ok && j.details?.some((d) => d.issue === 'ORDER_ALREADY_CAPTURED')) {
    const g = await fetch(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(ordenId)}`, { headers: { Authorization: `Bearer ${token}` } });
    j = (await g.json()) as PaypalOrden;
  } else if (!r.ok) {
    return { captura: null, rechazado: !!j.details?.some((d) => d.issue && RECHAZOS.has(d.issue)) };
  }
  const unidad = j.purchase_units?.[0];
  const cap = unidad?.payments?.captures?.find((c) => c.status === 'COMPLETED');
  if (!cap) {
    // Captura DECLINED/FAILED dentro de una respuesta 2xx: también es un no.
    const mala = unidad?.payments?.captures?.some((c) => c.status === 'DECLINED' || c.status === 'FAILED');
    return { captura: null, rechazado: !!mala };
  }
  // La orden tiene que ser de ESTA compra (custom_id lo puso el server al crearla).
  const custom = cap.custom_id ?? unidad?.custom_id;
  if (custom && custom !== compraId) return { captura: null, rechazado: false };
  return { captura: cap, rechazado: false };
}
