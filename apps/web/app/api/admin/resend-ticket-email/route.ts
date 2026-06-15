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
    // No exponemos forma/longitud/prefijo de la API key (aunque sea super-admin):
    // solo si está cargada, si tiene whitespace accidental, y el from (no secreto).
    const raw = process.env.RESEND_API_KEY;
    return NextResponse.json({
      ok: true,
      status: 'probe',
      has_key: Boolean(raw),
      key_has_whitespace: raw ? /\s/.test(raw) : false,
      from_email: process.env.RESEND_FROM_EMAIL ?? null,
    });
  }

  const orderId = body.orderId;
  if (!orderId || typeof orderId !== 'string') {
    return NextResponse.json({ ok: false, reason: 'invalid_order_id' }, { status: 400 });
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  // Cargamos la marca de la orden desde la DB (server-trusted) para (a) el guard
  // de tenancy y (b) acotar el force-clear por brand_id (defensa en profundidad).
  const { data: ord, error: ordErr } = await admin
    .from('orders')
    .select('brand_id')
    .eq('id', orderId)
    .maybeSingle();
  if (ordErr) {
    return NextResponse.json({ ok: false, reason: 'lookup_failed' }, { status: 500 });
  }

  // TENANCY: el super admin puede reenviar cualquier orden; un brand_admin SOLO
  // las de SU marca. Antes solo se exigía ser brand_admin de ALGUNA marca → un
  // brand_admin de la marca A podía reenviar / limpiar email_sent_at de órdenes
  // de la marca B. Mismo 403 para "no es tuya" y "no existe" (no filtra existencia).
  if (!user.isSuperAdmin) {
    const ownsBrand =
      !!ord && user.brandMemberships.some((m) => m.role === 'brand_admin' && m.brandId === ord.brand_id);
    if (!ownsBrand) {
      return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 });
    }
  }

  if (body.force) {
    let clearQuery = admin.from('orders').update({ email_sent_at: null }).eq('id', orderId);
    if (ord?.brand_id) clearQuery = clearQuery.eq('brand_id', ord.brand_id); // auto-contenido
    const { error: clearErr } = await clearQuery;
    if (clearErr) {
      return NextResponse.json({ ok: false, reason: `clear_failed:${clearErr.message}` }, { status: 500 });
    }
  }

  const result = await sendTicketEmail(orderId);
  return NextResponse.json(result);
}
