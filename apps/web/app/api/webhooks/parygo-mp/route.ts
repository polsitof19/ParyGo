import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyMpSignature } from '@/lib/mpSignature';
import { mpPago, mpWebhookSecret } from '@/lib/cobroParygo';
import { sendAltaPendiente } from '@/lib/email/sendAltaEmails';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// Webhook de MercadoPago para los PAQUETES DE EVENTOS de ParyGo (0070).
// =============================================================
// Mismas capas que el de entradas (/api/webhooks/mp/[brandId]):
//   1. Firma HMAC obligatoria con PARYGO_MP_WEBHOOK_SECRET, sin bypass.
//   2. El pago se vuelve a pedir a la API de MP: el cuerpo no se cree.
//   3. settle_pack_purchase contrasta pasarela, moneda y monto contra lo
//      congelado, con FOR UPDATE; idempotente (un reintento = 'already_paid').
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const secret = mpWebhookSecret();
  if (!secret) return NextResponse.json({ error: 'webhook_secret_missing' }, { status: 401 });

  const url = new URL(req.url);
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id');
  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id');
  if (!xSignature || !xRequestId || !dataId) return NextResponse.json({ error: 'missing_signature' }, { status: 401 });
  if (!(await verifyMpSignature({ header: xSignature, secret, dataId, requestId: xRequestId }))) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let body: { type?: string; data?: { id?: string } } = {};
  try { body = (await req.json()) as typeof body; } catch { /* MP a veces manda solo query */ }
  if (body.type && body.type !== 'payment') return NextResponse.json({ ok: true, ignored: body.type });
  // Solo el data.id FIRMADO (el de la query), nunca el del cuerpo, y numérico:
  // va a la ruta de la API de MP con el token de ParyGo.
  const paymentId = dataId;
  if (!/^\d{1,20}$/.test(paymentId)) return NextResponse.json({ ok: true, ignored: 'bad_id' });

  let pago;
  try {
    pago = await mpPago(paymentId);
  } catch {
    return NextResponse.json({ error: 'mp_fetch_failed' }, { status: 502 });
  }
  const compraId = pago?.external_reference;
  if (!compraId || !UUID_RE.test(compraId)) return NextResponse.json({ ok: true, ignored: 'no_external_reference' });

  const admin = createAdminClient();
  if (pago.status === 'rejected' || pago.status === 'cancelled') {
    await admin.from('pack_purchases').update({ status: 'failed' }).eq('id', compraId).eq('status', 'pending');
    return NextResponse.json({ ok: true, status: pago.status });
  }
  // Devolución o contracargo de un paquete ya acreditado: no se descuenta solo
  // (el saldo pudo gastarse en eventos), queda en el log para que Paul decida.
  if (pago.status === 'refunded' || pago.status === 'charged_back' || pago.status === 'in_mediation') {
    const { data: c } = await admin.from('pack_purchases').select('brand_id, pack, status').eq('id', compraId).maybeSingle();
    if (c) {
      await admin.from('events_log').insert({
        brand_id: c.brand_id, type: 'pack_purchase_reversal',
        payload: { purchase_id: compraId, payment_id: String(pago.id ?? paymentId), mp_status: pago.status, pack: c.pack, purchase_status: c.status },
      });
    }
    return NextResponse.json({ ok: true, status: pago.status });
  }
  if (pago.status !== 'approved') return NextResponse.json({ ok: true, status: pago.status });

  const monto = typeof pago.transaction_amount === 'number' ? Math.round(pago.transaction_amount * 100) : null;
  if (monto === null || !pago.currency_id) return NextResponse.json({ ok: true, ignored: 'no_amount' });

  const { data, error } = await admin.rpc('settle_pack_purchase', {
    p_purchase_id: compraId,
    p_provider: 'mercadopago',
    p_payment_id: String(pago.id ?? paymentId),
    p_paid_cents: monto,
    p_currency: pago.currency_id,
  });
  // Error de base → 500 para que MP reintente (la RPC es transaccional).
  if (error) return NextResponse.json({ ok: false, error: 'settle_failed' }, { status: 500 });

  // Alta con pack (/empezar) que pagó y todavía no volvió a la página: la marca
  // no tiene dueña. Se le manda el link para terminar (solo en la acreditación,
  // no en cada reintento de MP).
  const r = data as { action?: string; brand_id?: string };
  if (r?.action === 'credited' && r.brand_id) {
    const { count: miembros } = await admin.from('brand_members').select('user_id', { count: 'exact', head: true }).eq('brand_id', r.brand_id);
    if (!miembros) {
      const { data: b } = await admin.from('brands').select('name, contact_email').eq('id', r.brand_id).single();
      if (b?.contact_email) await sendAltaPendiente({ to: b.contact_email, marca: b.name, compraId });
    }
  }
  return NextResponse.json({ ok: true, ...(data as object) });
}

export function GET() {
  return NextResponse.json({ ok: true, kind: 'parygo_pack_webhook' });
}
