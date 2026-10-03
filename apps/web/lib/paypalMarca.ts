import type { SupabaseClient } from '@supabase/supabase-js';
import {
  paypalCapturar, paypalDevolver, paypalLeerCaptura, centsDePaypal,
  type PaypalCaptura, type PaypalCred,
} from '@/lib/paypalApi';

// =============================================================
// PayPal de una MARCA para cobrar sus entradas (0091; plan en AGENTS.md).
// =============================================================
// La marca pega el Client ID + Secret de SU app de PayPal; la plata va a su
// cuenta. La plata recién se mueve cuando ESTE server captura, y captura solo
// si puede_cobrar_paypal dice que hay cupo y que la orden sigue con las mismas
// credenciales. Una captura que no termina en entradas se DEVUELVE sola.

// PayPal no opera PEN, COP, CLP ni ARS.
export const MONEDAS_PAYPAL = ['USD', 'EUR', 'MXN'] as const;
export const paypalSirve = (moneda: string | null | undefined) => (MONEDAS_PAYPAL as readonly string[]).includes(moneda ?? '');

export type CredMarca = PaypalCred & { webhookId: string | null; moneda: string };

// null = la marca no tiene PayPal. Un error de la base TIRA (falla cerrado).
export async function credencialesPaypal(admin: SupabaseClient, brandId: string, key: string): Promise<CredMarca | null> {
  const { data, error } = await admin.rpc('get_brand_paypal_credentials', { p_brand_id: brandId, p_encryption_key: key });
  if (error) throw new Error('paypal_credenciales_ilegibles');
  const r = (data as { client_id: string; secret: string; webhook_id: string | null; sandbox: boolean; moneda: string }[] | null)?.[0];
  if (!r?.client_id || !r.secret) return null;
  return { clientId: r.client_id, secret: r.secret, sandbox: r.sandbox, webhookId: r.webhook_id, moneda: r.moneda };
}

// ¿Se puede ofrecer PayPal al comprador? Conectada y en una moneda que PayPal
// acepta. Sin red (no pide token): un par revocado falla al crear la orden y
// el comprador recibe un mensaje accionable.
export async function paypalUsable(admin: SupabaseClient, brandId: string): Promise<boolean> {
  const { data, error } = await admin.from('brands').select('paypal_client_id, moneda').eq('id', brandId).maybeSingle();
  if (error || !data) return false;
  return !!data.paypal_client_id && paypalSirve(data.moneda);
}

// ¿Hay un comprador pagando con PayPal AHORA? (misma regla que la RPC; para el
// mensaje de Mi marca antes de pegarle a PayPal). Falla cerrado.
export async function pagosPaypalEnCurso(admin: SupabaseClient, brandId: string): Promise<boolean> {
  const { count, error } = await admin.from('orders').select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId).eq('payment_method', 'paypal').eq('status', 'pending_payment')
    .not('paypal_order_id', 'is', null)
    .gt('created_at', new Date(Date.now() - 30 * 60_000).toISOString());
  return error ? true : (count ?? 0) > 0;
}

export type ResultadoPaypal =
  | { ok: true; action: 'issued' | 'already_issued' }
  | { ok: false; motivo: 'rechazado' | 'sin_cupo' | 'devuelto' | 'pendiente' | 'credenciales_cambiaron' | 'ignorado' | 'error'; detalle?: string };

// Liquida una captura COMPLETED de la orden. Si la base no la emite (cupo
// lleno, monto o moneda que no calzan), se devuelve la plata sola.
async function liquidarCaptura(
  admin: SupabaseClient, c: CredMarca, brandId: string, orderId: string, cap: PaypalCaptura,
): Promise<ResultadoPaypal> {
  const capId = cap.id ?? '';
  const cents = centsDePaypal(cap.amount?.value);
  const { data, error } = await admin.rpc('settle_paypal_payment', {
    p_order_id: orderId, p_brand_id: brandId, p_capture_id: capId,
    p_paid_cents: cents ?? -1, p_currency: cap.amount?.currency_code ?? '',
  });
  if (error) return { ok: false, motivo: 'error', detalle: error.message };
  const r = data as { ok?: boolean; action?: string } | null;
  if (r?.ok && (r.action === 'issued' || r.action === 'already_issued')) return { ok: true, action: r.action };
  // Ya devuelta, otra captura de una orden emitida o de otra orden: la plata
  // de ESTA captura no corresponde a entradas nuevas → se devuelve. Solo NO
  // se devuelve si la base no reconoce la orden (no es nuestra).
  if (r?.action === 'order_not_found' || r?.action === 'not_paypal' || r?.action === 'sin_captura') {
    return { ok: false, motivo: 'ignorado', detalle: r.action };
  }
  return devolverAuto(admin, c, brandId, orderId, capId, r?.action ?? 'desconocido');
}

async function devolverAuto(
  admin: SupabaseClient, c: CredMarca, brandId: string, orderId: string, capId: string, causa: string,
): Promise<ResultadoPaypal> {
  let devuelta = false;
  try { devuelta = await paypalDevolver(c, capId); } catch { devuelta = false; }
  if (!devuelta) {
    // Queda en Salud para devolverla a mano: nunca se pierde de vista.
    const { count } = await admin.from('events_log').select('id', { count: 'exact', head: true })
      .eq('order_id', orderId).eq('type', 'paypal_refund_pendiente').eq('payload->>capture_id', capId);
    if (!count) await admin.from('events_log').insert({ brand_id: brandId, order_id: orderId, type: 'paypal_refund_pendiente', payload: { capture_id: capId, causa } });
    return { ok: false, motivo: 'error', detalle: `devolucion_fallida:${causa}` };
  }
  // Una orden ya emitida (captura duplicada) NO se toca: refund_paypal_order
  // contesta capture_mismatch y deja la bitácora.
  await admin.rpc('refund_paypal_order', { p_order_id: orderId, p_brand_id: brandId, p_capture_id: capId, p_motivo: `auto:${causa}` });
  return { ok: false, motivo: 'devuelto', detalle: causa };
}

// VUELTA del comprador (?token=<orden de PayPal>): la confirmación llama esto.
// Orden → ¿se puede cobrar? → capturar → liquidar (o devolver).
export async function cobrarVueltaPaypal(
  admin: SupabaseClient, brandId: string, orderId: string, paypalOrderId: string, key: string,
): Promise<ResultadoPaypal> {
  // Un error al LEER (la base parpadeó) no es "cambiaron las credenciales": la
  // orden sigue viva y el comprador puede recargar (security review M2).
  let c: CredMarca | null;
  try { c = await credencialesPaypal(admin, brandId, key); } catch { return { ok: false, motivo: 'error', detalle: 'credenciales_ilegibles' }; }
  if (!c) return { ok: false, motivo: 'credenciales_cambiaron' };
  const { data: p, error } = await admin.rpc('puede_cobrar_paypal', {
    p_order_id: orderId, p_brand_id: brandId, p_paypal_order_id: paypalOrderId, p_client_id: c.clientId,
  });
  if (error) return { ok: false, motivo: 'error', detalle: error.message };
  const pr = p as { ok?: boolean; action?: string } | null;
  if (!pr?.ok) {
    if (pr?.action === 'ya_pagada') return { ok: true, action: 'already_issued' };
    if (pr?.action === 'sin_cupo') return { ok: false, motivo: 'sin_cupo' };
    if (pr?.action === 'credenciales_cambiaron') return { ok: false, motivo: 'credenciales_cambiaron' };
    return { ok: false, motivo: 'ignorado', detalle: pr?.action };
  }
  let res;
  try {
    res = await paypalCapturar(c, paypalOrderId, orderId);
  } catch (e) {
    return { ok: false, motivo: 'error', detalle: e instanceof Error ? e.message : 'capturar' };
  }
  if (res.rechazado) return { ok: false, motivo: 'rechazado' };
  if (res.pendiente) return { ok: false, motivo: 'pendiente' };
  if (!res.captura?.id) return { ok: false, motivo: 'error', detalle: 'sin_captura' };
  return liquidarCaptura(admin, c, brandId, orderId, res.captura);
}

// AVISO de PayPal (webhook). El cuerpo NO se cree: lo único que se toma es el
// id de la captura, y SOLO después de que la base lo reconoce como de una
// orden de esta marca (un id inventado no gasta la API de la marca). La
// captura se relee con el token de la marca.
export async function procesarAvisoPaypal(
  admin: SupabaseClient, brandId: string, evento: string, recurso: PaypalCaptura, key: string,
): Promise<ResultadoPaypal | { ok: false; motivo: 'reintentar' }> {
  const capId = typeof recurso.id === 'string' ? recurso.id : '';
  if (!/^[A-Z0-9]{5,40}$/.test(capId)) return { ok: false, motivo: 'ignorado', detalle: 'id' };

  let orderId: string | null = null;
  if (evento === 'PAYMENT.CAPTURE.COMPLETED') {
    const ppOrder = recurso.supplementary_data?.related_ids?.order_id ?? '';
    if (!/^[A-Z0-9]{5,40}$/.test(ppOrder)) return { ok: false, motivo: 'ignorado', detalle: 'orden' };
    const { data, error } = await admin.from('orders').select('id, status')
      .eq('brand_id', brandId).eq('payment_method', 'paypal').eq('paypal_order_id', ppOrder).maybeSingle();
    if (error) return { ok: false, motivo: 'reintentar' };
    if (!data || data.status === 'paid' || data.status === 'refunded') return { ok: false, motivo: 'ignorado', detalle: 'no_pendiente' };
    orderId = data.id;
  } else if (evento === 'PAYMENT.CAPTURE.REFUNDED' || evento === 'PAYMENT.CAPTURE.REVERSED') {
    const { data, error } = await admin.from('orders').select('id')
      .eq('brand_id', brandId).eq('payment_method', 'paypal').eq('paypal_capture_id', capId).maybeSingle();
    if (error) return { ok: false, motivo: 'reintentar' };
    if (!data) return { ok: false, motivo: 'ignorado', detalle: 'captura_desconocida' };
    orderId = data.id;
  } else {
    return { ok: false, motivo: 'ignorado', detalle: 'evento' };
  }

  // Por ORDEN (resuelta desde la base), no por el id del aviso: con un id
  // nuevo en cada POST, el candado por captura no frenaba a quien conoce una
  // orden propia pendiente (security review M1).
  const { data: candado } = await admin.rpc('tomar_candado', { p_clave: `pp_aviso:${evento}:${orderId}`, p_segundos: 10 });
  if (candado !== true) return { ok: false, motivo: 'reintentar' };

  let c: CredMarca | null;
  try { c = await credencialesPaypal(admin, brandId, key); } catch { return { ok: false, motivo: 'reintentar' }; }
  if (!c) return { ok: false, motivo: 'ignorado', detalle: 'sin_credenciales' };
  let cap: PaypalCaptura | null;
  try { cap = await paypalLeerCaptura(c, capId); } catch { return { ok: false, motivo: 'reintentar' }; }
  // La captura tiene que existir PARA ESTAS credenciales y ser de esta orden.
  if (!cap || cap.custom_id !== orderId) return { ok: false, motivo: 'ignorado', detalle: 'captura_ajena' };

  if (cap.status === 'COMPLETED') return liquidarCaptura(admin, c, brandId, orderId, cap);
  // REVERSED (contracargo) o REFUNDED total: se anulan las entradas. Una
  // devolución PARCIAL deja la captura en PARTIALLY_REFUNDED: no anula
  // (misma decisión que MP).
  if (cap.status === 'REFUNDED' || cap.status === 'REVERSED') {
    const { error } = await admin.rpc('refund_paypal_order', { p_order_id: orderId, p_brand_id: brandId, p_capture_id: capId, p_motivo: cap.status.toLowerCase() });
    if (error) return { ok: false, motivo: 'reintentar' };
    return { ok: false, motivo: 'devuelto', detalle: cap.status };
  }
  return { ok: false, motivo: 'ignorado', detalle: cap.status ?? 'estado' };
}
