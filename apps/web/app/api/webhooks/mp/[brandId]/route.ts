import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { fetchMercadoPagoPayment } from '@/lib/mercadopago';
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

  // Defense-in-depth: the preference stamps metadata.brand_id (createMercadoPago
  // Preference). If the re-fetched payment belongs to a different brand, ignore.
  // (settle_mp_payment already enforces tenancy via brand_id; this is a belt.)
  const metaBrandId = (payment as { metadata?: { brand_id?: string } } | null)?.metadata?.brand_id;
  if (metaBrandId && metaBrandId !== brand.id) {
    return NextResponse.json({ ok: true, ignored: 'brand_mismatch' });
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
      await admin.rpc('release_promo_redemption_for_order', { p_order_id: externalRef });
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

  // 5. APPROVED → settle ATOMICALLY. The RPC holds SELECT ... FOR UPDATE on the
  // order and, in one transaction: contrasts the paid amount vs the server-side
  // frozen total, flips the order to paid, consumes the promo redemption, and
  // issues the tickets. Concurrency-safe (a single FOR UPDATE winner) and
  // idempotent (re-runs return 'already_issued' without duplicating tickets).
  // The webhook NEVER trusts the payload amount — it passes MP's authoritative
  // transaction_amount and the RPC compares it server-side.
  const txAmount = (payment as { transaction_amount?: number } | null)?.transaction_amount;
  const paidCents = typeof txAmount === 'number' ? Math.round(txAmount * 100) : null;
  if (paidCents === null) {
    await admin.from('events_log').insert({
      brand_id: brand.id,
      order_id: externalRef,
      type: 'mp_amount_missing',
      payload: { payment_id: String(paymentId) },
    });
    return NextResponse.json({ ok: true, ignored: 'no_amount' });
  }

  const { data: settleData, error: settleErr } = await admin.rpc('settle_mp_payment', {
    p_order_id: externalRef,
    p_brand_id: brand.id,
    p_payment_id: String(paymentId),
    p_status: status,
    p_paid_amount_cents: paidCents,
  });

  if (settleErr) {
    // DB error mid-settlement → forensic + 500 so MP retries (the RPC is
    // transactional, so a failure leaves the order un-flipped and un-issued).
    await admin.from('events_log').insert({
      brand_id: brand.id,
      order_id: externalRef,
      type: 'tickets_issue_failed',
      payload: { error: settleErr.message, payment_id: String(paymentId), stage: 'settle_mp_payment' },
    });
    return NextResponse.json({ ok: false, error: 'settle_failed' }, { status: 500 });
  }

  const result = (settleData ?? {}) as {
    ok?: boolean;
    action?: string;
    ticket_count?: number;
    expected_cents?: number;
    paid_cents?: number;
  };

  // Amount mismatch: the buyer paid an amount that doesn't equal the order
  // total. NEVER emit. Log loudly for forensics; ack 200 so MP stops retrying.
  // The order stays pending (swept later) and the promoter refunds manually.
  if (result.action === 'amount_mismatch') {
    await admin.from('events_log').insert({
      brand_id: brand.id,
      order_id: externalRef,
      type: 'mp_amount_mismatch',
      payload: {
        payment_id: String(paymentId),
        expected_cents: result.expected_cents,
        paid_cents: result.paid_cents,
      },
    });
    return NextResponse.json({ ok: true, ignored: 'amount_mismatch' });
  }

  // Not settleable (order not found / not MP / wrong state / no items). Log + ack.
  if (!result.ok) {
    await admin.from('events_log').insert({
      brand_id: brand.id,
      order_id: externalRef,
      type: 'mp_settle_skipped',
      payload: { payment_id: String(paymentId), action: result.action ?? 'unknown' },
    });
    return NextResponse.json({ ok: true, ignored: result.action ?? 'not_settleable' });
  }

  // Settled (issued | already_issued). Deliver the ticket email — idempotent via
  // email_sent_at, so a webhook retry never double-sends and a prior email
  // failure recovers on the next retry. Webhook still 200s even if email fails.
  const emailResult = await sendTicketEmail(externalRef);
  if (!emailResult.ok) {
    console.error('[mp-webhook] sendTicketEmail failed', {
      order_id: externalRef,
      reason: emailResult.reason,
    });
  }

  return NextResponse.json({
    ok: true,
    action: result.action,
    issued: result.ticket_count ?? 0,
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
      // split SOLO en el primer '=' (un valor podría contener '=', p. ej. base64).
      const idx = p.indexOf('=');
      const k = idx === -1 ? p : p.slice(0, idx);
      const v = idx === -1 ? '' : p.slice(idx + 1);
      return [k.trim(), v.trim()];
    })
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  // Anti-replay: rechazar firmas viejas (> 5 min de skew). La idempotencia de
  // settle_mp_payment (mp_payment_id único) ya evita duplicados; esto agrega
  // defensa contra el replay de una firma HMAC capturada. MP firma CADA intento
  // de notificación con su propio ts, así que los reintentos legítimos traen un
  // ts fresco y NO se rechazan — solo se descarta un payload viejo reenviado.
  const tsNum = parseInt(ts, 10);
  if (!Number.isFinite(tsNum)) return false;
  const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000; // MP usa segundos (a veces ms)
  if (Math.abs(Date.now() - tsMs) > 300_000) return false;
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
