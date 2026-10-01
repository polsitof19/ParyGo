import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { liquidarPagoMp } from '@/lib/liquidarPagoMp';
import { sendTicketEmail } from '@/lib/email/sendTicketEmail';
import { verifyMpSignature } from '@/lib/mpSignature';

// Runs on the Cloudflare Pages edge (Workers). We use Web Crypto for the
// HMAC verification — no node:crypto.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// MercadoPago webhook
// =============================================================
// MP sends POST to this URL on every payment lifecycle event.
// Security layers:
//   1. Verify HMAC signature using brand's mp_webhook_secret (per-brand)
//   2. Re-fetch payment from MP API (don't trust webhook payload alone)
//   3. Idempotency: orders.mp_payment_id UNIQUE prevents double-processing
//   4. Quick 200 OK on duplicates so MP stops retrying

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: { brandId: string } }
) {
  const admin = createAdminClient();

  if (!UUID_V4_RE.test(params.brandId)) {
    return NextResponse.json({ error: 'invalid_brand_id' }, { status: 400 });
  }

  // 1. Load brand + webhook secret (encriptado, migr 0034 → se desencripta vía
  // RPC service-role con la clave del server; nunca en texto plano en la DB).
  const { data: brand } = await admin
    .from('brands')
    .select('id')
    .eq('id', params.brandId)
    .maybeSingle();
  if (!brand) {
    return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });
  }
  const { data: webhookSecret } = await admin.rpc('get_brand_mp_webhook_secret', {
    p_brand_id: brand.id,
    p_encryption_key: serverEnv.BRAND_CREDS_ENCRYPTION_KEY,
  });

  // 2. Verify MP signature — MANDATORY, no exceptions. There is NO environment
  // bypass: a brand without a webhook secret cannot be verified, so we reject
  // (never process an unsigned/unverifiable webhook → that would let anyone
  // forge a "payment approved" and mint free tickets).
  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id');
  const url = new URL(req.url);
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id');

  if (!webhookSecret) {
    return NextResponse.json({ error: 'webhook_secret_missing' }, { status: 401 });
  }
  if (!xSignature || !dataId || !xRequestId) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 401 });
  }
  const verified = await verifyMpSignature({
    header: xSignature,
    secret: webhookSecret,
    dataId,
    requestId: xRequestId,
  });
  if (!verified) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  // 3. El body solo aporta `action` para la bitácora. El id del pago es el
  // data.id de la URL: es lo que FIRMA x-signature (el body no va firmado).
  let body: { action?: string; type?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Sin body igual se procesa: el pago se re-pide a MP.
  }
  // Solo pagos: un aviso de merchant_order trae otro id y re-pedirlo como pago
  // daba 404 → 502 → MP reintentando en vano.
  const tipo = body.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic');
  if (tipo && tipo !== 'payment') return NextResponse.json({ ok: true, ignored: `topic_${tipo}` });

  // 4. Re-pedir el pago a MP y liquidar (lib/liquidarPagoMp.ts, el mismo
  // camino que la vuelta del comprador a la confirmación).
  const r = await liquidarPagoMp(admin, brand.id, String(dataId), { origen: 'webhook', action: body.action ?? null });
  if ('retry' in r) {
    // Error de MP o de la base: 5xx para que MP reintente (settle es
    // transaccional e idempotente).
    return NextResponse.json({ ok: false, error: r.error }, { status: r.error === 'settle_failed' ? 500 : 502 });
  }
  if (!r.ok) return NextResponse.json({ ok: true, ignored: r.ignored });
  if (r.action !== 'issued' && r.action !== 'already_issued') return NextResponse.json({ ok: true, status: r.status });

  // Liquidado: el correo de la entrada. Idempotente vía email_sent_at, así que
  // un reintento no lo duplica y un fallo anterior se recupera. El webhook
  // responde 200 aunque el correo falle.
  const emailResult = await sendTicketEmail(r.orderId);
  if (!emailResult.ok) {
    console.error('[mp-webhook] sendTicketEmail failed', { order_id: r.orderId, reason: emailResult.reason });
  }
  return NextResponse.json({ ok: true, action: r.action, issued: r.ticketCount, email: emailResult.status });
}

// Also allow GET for MP's webhook test endpoint
export function GET() {
  return NextResponse.json({ ok: true, kind: 'parygo_mp_webhook' });
}
