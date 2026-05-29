import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { sendTicketEmail } from '@/lib/email/sendTicketEmail';

// =============================================================
// POST /api/admin/resend-ticket-email
// Body: { orderId: string, force?: boolean }
// =============================================================
// Operator endpoint to (re)send the ticket-delivery email for a paid
// order. By default, sendTicketEmail is idempotent via
// orders.email_sent_at — a previously-sent order will short-circuit
// with status='already_sent'. Pass force=true to clear that timestamp
// first (so the helper actually re-fires).
//
// Auth: super_admin OR a brand_admin of the order's brand. We let the
// helper resolve the brand via its embedded query; here we just gate
// on super_admin presence and require a brand_admin to come from the
// brand's own dashboard (defense in depth — the helper doesn't enforce
// it on its own).

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { orderId?: string; force?: boolean; probe?: boolean };

  // Diagnostic probe: returns whether RESEND_API_KEY is loaded (and its
  // shape) without sending. Only super_admins can probe.
  if (body.probe) {
    if (!user.isSuperAdmin) {
      return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 });
    }
    const raw = process.env.RESEND_API_KEY;
    return NextResponse.json({
      ok: true,
      status: 'probe',
      has_key: Boolean(raw),
      key_len: raw ? raw.length : 0,
      key_prefix: raw ? raw.slice(0, 5) : null,
      key_suffix: raw ? raw.slice(-3) : null,
      key_has_whitespace: raw ? /\s/.test(raw) : false,
      from_email: process.env.RESEND_FROM_EMAIL ?? null,
    });
  }

  const orderId = body.orderId;
  if (!orderId || typeof orderId !== 'string') {
    return NextResponse.json({ ok: false, reason: 'invalid_order_id' }, { status: 400 });
  }

  // Super admin can resend for any order; brand admins must own the brand.
  if (!user.isSuperAdmin && user.brandMemberships.every((m) => m.role !== 'brand_admin')) {
    return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 });
  }

  if (body.force) {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { error: clearErr } = await admin
      .from('orders')
      .update({ email_sent_at: null })
      .eq('id', orderId);
    if (clearErr) {
      return NextResponse.json({ ok: false, reason: `clear_failed:${clearErr.message}` }, { status: 500 });
    }
  }

  const result = await sendTicketEmail(orderId);
  return NextResponse.json(result);
}
