import type { SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';
import { fetchMercadoPagoPayment } from '@/lib/mercadopago';

// Liquida un pago de Mercado Pago de una MARCA (cobro de entradas con tarjeta).
// Lo llaman los dos caminos: el webhook firmado (/api/webhooks/mp/[brandId]) y
// la VUELTA del comprador a la confirmación (?payment_id=), que es el respaldo
// si el webhook no llega (secret sin cargar, MP caído). Los dos son seguros por
// lo mismo: el pago se RE-PIDE a MP con el token de la marca (nadie puede
// inventar uno aprobado), external_reference tiene que ser la orden, la moneda
// PEN y el monto lo contrasta settle_mp_payment contra el total congelado.
// La función no manda el correo: el llamador decide (el webhook lo manda ya,
// la página lo encola).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResultadoMp =
  | { ok: true; orderId: string; status: 'approved'; action: 'issued' | 'already_issued'; ticketCount: number }
  | { ok: true; orderId: string; status: string; action: 'recorded' | 'refunded' }
  | { ok: false; orderId?: string; status?: string; ignored: string }
  | { ok: false; error: string; retry: true };

export async function liquidarPagoMp(
  admin: SupabaseClient,
  brandId: string,
  paymentId: string,
  opts: { origen: 'webhook' | 'vuelta'; orderEsperada?: string; action?: string | null }
): Promise<ResultadoMp> {
  let payment;
  try {
    payment = await fetchMercadoPagoPayment(brandId, paymentId, serverEnv.BRAND_CREDS_ENCRYPTION_KEY);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'mp_fetch_failed', retry: true };
  }

  const orderId = payment?.external_reference ?? '';
  const status = payment?.status ?? '';
  if (!UUID_RE.test(orderId)) return { ok: false, ignored: 'no_external_reference' };
  // La vuelta trae la orden en la URL: el pago tiene que ser de ESA orden.
  if (opts.orderEsperada && opts.orderEsperada !== orderId) return { ok: false, ignored: 'order_mismatch' };
  // Toda preferencia de entradas lleva metadata.brand_id: sin ella o con otra
  // marca, no es un pago nuestro (settle además filtra por brand_id).
  if (payment?.metadata?.brand_id !== brandId) return { ok: false, orderId, ignored: 'brand_mismatch' };

  const log = (type: string, payload: Record<string, unknown>) =>
    admin.from('events_log').insert({ brand_id: brandId, order_id: orderId, type, payload });

  // La vuelta se re-consulta en cada refresco de la confirmación: solo el
  // webhook deja el registro de "recibido" (lo accionable se loguea igual).
  if (opts.origen === 'webhook') await log('mp_webhook_received', { payment_id: paymentId, status, action: opts.action ?? null });

  if (status === 'refunded' || status === 'charged_back') {
    // Devuelta: la orden pasa a refunded y sus entradas se ANULAN (0083/0084),
    // solo si es EL pago que la liquidó (un duplicado devuelto no las toca).
    // Un reembolso PARCIAL deja el pago 'approved': la entrada sigue válida
    // (decisión de negocio: el organizador anula a mano si corresponde).
    const { data, error } = await admin.rpc('refund_mp_order', { p_order_id: orderId, p_brand_id: brandId, p_payment_id: paymentId, p_status: status });
    if (error) return { ok: false, error: error.message, retry: true };
    if (!(data as { ok?: boolean } | null)?.ok) return { ok: false, orderId, status, ignored: (data as { action?: string } | null)?.action ?? 'refund_skipped' };
    return { ok: true, orderId, status, action: 'refunded' };
  }

  if (status !== 'approved') {
    // Rechazado / cancelado / pendiente: se anota y NADA más. Un rechazo no
    // pasa la orden a 'failed': el comprador puede reintentar con otra tarjeta
    // en el MISMO checkout y ese pago aprobado tiene que liquidar. El hold de
    // stock vence solo (expires_at) y el promo lo libera el cron a los 30 min.
    await admin
      .from('orders')
      .update({ mp_payment_status: status })
      .eq('id', orderId)
      .eq('brand_id', brandId)
      .eq('status', 'pending_payment');
    return { ok: true, orderId, status, action: 'recorded' };
  }

  // Las entradas se cobran en soles: un pago en otra moneda no liquida aunque
  // el número coincida.
  if (payment?.currency_id && payment.currency_id !== 'PEN') {
    await log('mp_currency_mismatch', { payment_id: paymentId, currency_id: payment.currency_id });
    return { ok: false, orderId, status, ignored: 'currency_mismatch' };
  }
  const tx = payment?.transaction_amount;
  if (typeof tx !== 'number') {
    await log('mp_amount_missing', { payment_id: paymentId });
    return { ok: false, orderId, status, ignored: 'no_amount' };
  }

  // Atómico en la base: lock de la orden, monto contra el total congelado,
  // gate de cupo, flip a paid, promo y emisión. Idempotente.
  const { data, error } = await admin.rpc('settle_mp_payment', {
    p_order_id: orderId,
    p_brand_id: brandId,
    p_payment_id: paymentId,
    p_status: status,
    p_paid_amount_cents: Math.round(tx * 100),
  });
  if (error) {
    await log('tickets_issue_failed', { error: error.message, payment_id: paymentId, stage: 'settle_mp_payment' });
    return { ok: false, error: 'settle_failed', retry: true };
  }
  const r = (data ?? {}) as { ok?: boolean; action?: string; ticket_count?: number; expected_cents?: number; paid_cents?: number };
  if (r.action === 'amount_mismatch') {
    // NUNCA se emite. La orden queda y el organizador devuelve a mano.
    await log('mp_amount_mismatch', { payment_id: paymentId, expected_cents: r.expected_cents, paid_cents: r.paid_cents });
    return { ok: false, orderId, status, ignored: 'amount_mismatch' };
  }
  if (!r.ok) {
    await log('mp_settle_skipped', { payment_id: paymentId, action: r.action ?? 'unknown' });
    return { ok: false, orderId, status, ignored: r.action ?? 'not_settleable' };
  }
  return { ok: true, orderId, status: 'approved', action: r.action === 'already_issued' ? 'already_issued' : 'issued', ticketCount: r.ticket_count ?? 0 };
}
