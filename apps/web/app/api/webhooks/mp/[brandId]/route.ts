import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { fetchMercadoPagoPayment } from '@/lib/mercadopago';
import { issueTicketsForOrder, markOrderPaid } from '@/lib/tickets';
import { sendTicketEmail } from '@/lib/email/sendTicketEmail';

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

  // 1. Load brand + webhook secret
  const { data: brand } = await admin
    .from('brands')
    .select('id, mp_webhook_secret')
    .eq('id', params.brandId)
    .maybeSingle();
  if (!brand) {
    return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });
  }

  // 2. Verify MP signature header
  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id');
  const url = new URL(req.url);
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id');

  const isProduction = process.env.NODE_ENV === 'production';

  // Signature is mandatory whenever the brand has a secret configured —
  // not only in production. Dev bypass only applies if the brand hasn't
  // been wired up yet (no secret stored).
  if (brand.mp_webhook_secret) {
    if (!xSignature || !dataId || !xRequestId) {
      return NextResponse.json({ error: 'missing_signature' }, { status: 401 });
    }
    const verified = await verifyMpSignature({
      header: xSignature,
      secret: brand.mp_webhook_secret,
      dataId,
      requestId: xRequestId,
    });
    if (!verified) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
    }
  } else if (isProduction) {
    return NextResponse.json({ error: 'webhook_secret_missing' }, { status: 401 });
  }

  // 3. Parse body — MP sends { type, data: { id } }
  let body: { type?: string; action?: string; data?: { id?: string } };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const paymentId = body.data?.id ?? dataId;
  if (!paymentId) {
    return NextResponse.json({ ok: true, ignored: 'no_payment_id' });
  }

  // 4. Fetch payment from MP API (re-verify)
  let payment;
  try {
    payment = await fetchMercadoPagoPayment(
      brand.id,
      String(paymentId),
      serverEnv.BRAND_CREDS_ENCRYPTION_KEY
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'mp_fetch_failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const externalRef = payment?.external_reference; // = orderId
  const status = payment?.status; // 'approved' | 'pending' | 'in_process' | 'rejected' | ...

  if (!externalRef || !UUID_V4_RE.test(externalRef)) {
    // Don't let MP retry on a malformed external_reference; ack and ignore.
    return NextResponse.json({ ok: true, ignored: 'no_external_reference' });
  }

  // Log every webhook receipt for forensics
  await admin.from('events_log').insert({
    brand_id: brand.id,
    order_id: externalRef,
    type: 'mp_webhook_received',
    payload: {
      payment_id: String(paymentId),
      status,
      action: body.action ?? null,
    },
  });

  if (status !== 'approved') {
    // Pending / rejected / refunded — record but don't issue tickets
    if (status === 'rejected' || status === 'cancelled') {
      await admin
        .from('orders')
        .update({ status: 'failed', mp_payment_status: status })
        .eq('id', externalRef)
        .eq('status', 'pending_payment');
      // Free the held stock so other buyers can grab it.
      await admin.rpc('release_stock_reservations_for_order', { p_order_id: externalRef });
    } else if (status === 'refunded' || status === 'charged_back') {
      // Only flip orders that were already paid; never resurrect a failed
      // order into refunded state from a stray webhook.
      await admin
        .from('orders')
        .update({ status: 'refunded', mp_payment_status: status })
        .eq('id', externalRef)
        .eq('status', 'paid');
    }
    return NextResponse.json({ ok: true, status });
  }

  // 5. Mark order paid + issue tickets (both idempotent)
  const { alreadyPaid } = await markOrderPaid(externalRef, {
    mpPaymentId: String(paymentId),
    mpPaymentStatus: status,
  });

  const issue = await issueTicketsForOrder({
    orderId: externalRef,
    reason: 'mp_paid',
  });

  if (!issue.ok) {
    // Critical: payment received but tickets failed. Log loudly.
    await admin.from('events_log').insert({
      brand_id: brand.id,
      order_id: externalRef,
      type: 'tickets_issue_failed',
      payload: { error: issue.error, payment_id: String(paymentId) },
    });
    return NextResponse.json({ ok: false, error: issue.error }, { status: 500 });
  }

  // Fire ticket delivery email. Webhook MUST still 200 even if email fails
  // — MP will keep retrying otherwise, and the payment is already
  // recorded. sendTicketEmail logs structured on any failure and leaves
  // email_sent_at null for manual re-trigger.
  const emailResult = await sendTicketEmail(externalRef);
  if (!emailResult.ok) {
    console.error('[mp-webhook] sendTicketEmail failed', {
      order_id: externalRef,
      reason: emailResult.reason,
    });
  }

  return NextResponse.json({
    ok: true,
    alreadyPaid,
    issued: issue.ticketIds.length,
    alreadyIssued: issue.alreadyIssued,
    email: emailResult.status,
  });
}

// =============================================================
// MP signature verification (Web Crypto / edge-runtime compatible)
// Header format: "ts=<ts>,v1=<hex_hmac>"
// HMAC string: `id:<data_id>;request-id:<x_request_id>;ts:<ts>;`
// =============================================================
async function verifyMpSignature({
  header,
  secret,
  dataId,
  requestId,
}: {
  header: string;
  secret: string;
  dataId: string;
  requestId: string;
}): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, v] = p.split('=');
      return [k?.trim() ?? '', v?.trim() ?? ''];
    })
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(manifest)
  );
  const computed = bufferToHex(sigBuf);
  return timingSafeHexEqual(computed, v1);
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i]!.toString(16).padStart(2, '0');
  }
  return s;
}

// Constant-time string compare. Inputs must be lowercase hex.
function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Also allow GET for MP's webhook test endpoint
export function GET() {
  return NextResponse.json({ ok: true, kind: 'parygo_mp_webhook' });
}
