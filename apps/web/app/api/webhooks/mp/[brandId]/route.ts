import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { fetchMercadoPagoPayment } from '@/lib/mercadopago';
import { issueTicketsForOrder, markOrderPaid } from '@/lib/tickets';

export const runtime = 'nodejs';
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

export async function POST(
  req: NextRequest,
  { params }: { params: { brandId: string } }
) {
  const admin = createAdminClient();

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

  // Optional: in development we can disable signature check if no secret set yet.
  // In production, signature is mandatory.
  const isProduction = process.env.NODE_ENV === 'production';

  if (xSignature && brand.mp_webhook_secret && dataId && xRequestId) {
    const verified = verifyMpSignature({
      header: xSignature,
      secret: brand.mp_webhook_secret,
      dataId,
      requestId: xRequestId,
    });
    if (!verified && isProduction) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
    }
  } else if (isProduction) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 401 });
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

  if (!externalRef) {
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
    } else if (status === 'refunded' || status === 'charged_back') {
      await admin
        .from('orders')
        .update({ status: 'refunded', mp_payment_status: status })
        .eq('id', externalRef);
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

  // TODO(emails): when Resend key is configured, enqueue email send here.

  return NextResponse.json({
    ok: true,
    alreadyPaid,
    issued: issue.ticketIds.length,
    alreadyIssued: issue.alreadyIssued,
  });
}

// =============================================================
// MP signature verification
// Header format: "ts=<ts>,v1=<hex_hmac>"
// HMAC string: `id:<data_id>;request-id:<x_request_id>;ts:<ts>;`
// =============================================================
function verifyMpSignature({
  header,
  secret,
  dataId,
  requestId,
}: {
  header: string;
  secret: string;
  dataId: string;
  requestId: string;
}): boolean {
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
  const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(v1, 'hex'));
  } catch {
    return false;
  }
}

// Also allow GET for MP's webhook test endpoint
export function GET() {
  return NextResponse.json({ ok: true, kind: 'parygo_mp_webhook' });
}
