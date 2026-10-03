import { mpCrearPreferenciaApi, mpLeerPago } from '@/lib/mpApi';
import { paypalCrearOrden as paypalCrearOrdenApi, paypalCapturar, type PaypalCred } from '@/lib/paypalApi';

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

// ---------------- PayPal (las claves de Paul; la API vive en lib/paypalApi.ts) ----
function paypalCred(): PaypalCred {
  const clientId = env('PAYPAL_CLIENT_ID');
  const secret = env('PAYPAL_CLIENT_SECRET');
  if (!clientId || !secret) throw new Error('paypal_no_configurado');
  return { clientId, secret, sandbox: env('PAYPAL_ENV') !== 'live' };
}

export function paypalCrearOrden(i: { compraId: string; titulo: string; usd: string; volver: string; cancelar: string }) {
  return paypalCrearOrdenApi(paypalCred(), {
    ref: i.compraId, descripcion: i.titulo, moneda: 'USD', valor: i.usd, marca: 'ParyGo', volver: i.volver, cancelar: i.cancelar,
  });
}

// Cobra la orden aprobada de un paquete (ver paypalCapturar).
export function paypalCobrar(ordenId: string, compraId: string) {
  return paypalCapturar(paypalCred(), ordenId, compraId);
}
