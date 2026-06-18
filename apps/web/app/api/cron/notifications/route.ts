import { NextResponse, type NextRequest } from 'next/server';

// =============================================================
// POST /api/cron/notifications — WORKER de la cola de notificaciones (Grupo C)
// =============================================================
// Disparado por pg_cron (vía pg_net.http_post). En cada corrida:
//   1. enqueue_yape_notifications() escanea y encola lo nuevo (idempotente).
//   2. claim_notification_jobs() reclama una tanda ATÓMICAMENTE (FOR UPDATE SKIP
//      LOCKED → dos corridas no toman las mismas filas).
//   3. Envía cada job según su kind (recordatorio comprador / digest organizador).
//   4. Marca sent/failed. Fallidos y 'processing' colgados vuelven (≤5 intentos).
//
// AUTH: Bearer CRON_SECRET (server-only). Sin secreto válido → 401. No expone
// datos: solo procesa la cola y devuelve contadores.
// PII: la lista de destinatarios vive en la cola (RLS service_role only); este
// worker manda a cada uno SU email, nunca devuelve ni expone la lista.
// NO emite entradas, NO mueve dinero, NO aprueba Yape.
// =============================================================

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const BATCH = 50;
const CONCURRENCY = 4; // respeta el rate limit de Resend

type Job = {
  id: string; kind: string; brand_id: string | null; event_id: string | null;
  order_id: string | null; recipient_email: string; recipient_name: string;
  payload: Record<string, unknown> | null; dedupe_key: string;
};

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { sendYapeRecoveryEmail, sendYapePendingDigestEmail } = await import('@/lib/email/sendYapeNotificationEmails');
  const { sendEventReminderEmail } = await import('@/lib/email/sendEventReminderEmail');
  const { sendEventCancelledEmail } = await import('@/lib/email/sendEventCancelledEmail');
  const admin = createAdminClient();

  // 1. Encolar lo nuevo (idempotente). Si falla, igual seguimos a procesar lo ya
  //    encolado (no abortamos la tanda por un error de enqueue).
  const { error: enqErr, data: enqCount } = await admin.rpc('enqueue_yape_notifications', {});
  const enqueued = typeof enqCount === 'number' ? enqCount : 0;
  // Recordatorios pre-evento (eventos que arrancan dentro de 24h, idempotente).
  const { error: remErr, data: remCount } = await admin.rpc('enqueue_event_reminders', {});
  const enqueuedReminders = typeof remCount === 'number' ? remCount : 0;

  // 2. Reclamar una tanda.
  const { data: claimed, error: claimErr } = await admin.rpc('claim_notification_jobs', { p_limit: BATCH });
  if (claimErr) {
    return NextResponse.json({ ok: false, reason: `claim_failed:${claimErr.message}`, enqueue_error: enqErr?.message ?? null }, { status: 500 });
  }
  const rows = (claimed ?? []) as unknown as Job[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, enqueued, enqueuedReminders, claimed: 0, sent: 0, failed: 0, enqueue_error: enqErr?.message ?? null, reminder_enqueue_error: remErr?.message ?? null });
  }

  // 3. Cargar las marcas involucradas UNA vez (datos de marca, no PII del comprador).
  const brandIds = [...new Set(rows.map((r) => r.brand_id).filter((x): x is string => !!x))];
  const { data: brandsData } = await admin
    .from('brands')
    .select('id, name, slug, whatsapp_e164, contact_email, theme_json')
    .in('id', brandIds);
  const brandById = new Map((brandsData ?? []).map((b) => [b.id, b]));

  let sent = 0, failed = 0;
  const nowIso = () => new Date().toISOString();
  const markSent = (id: string, resendId: string | null) =>
    admin.from('notification_jobs').update({ status: 'sent', sent_at: nowIso(), resend_id: resendId, last_error: null }).eq('id', id);
  const markFailed = (id: string, reason: string) =>
    admin.from('notification_jobs').update({ status: 'failed', last_error: reason }).eq('id', id);

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const chunk = rows.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (r) => {
      const brand = r.brand_id ? brandById.get(r.brand_id) : null;
      if (!brand) { await markFailed(r.id, 'brand_not_found'); failed++; return; }
      const p = r.payload ?? {};
      const brandForEmail = {
        name: brand.name, slug: brand.slug, whatsapp_e164: brand.whatsapp_e164,
        contact_email: brand.contact_email,
        theme_json: brand.theme_json as { primary_color?: string; logo_url?: string | null } | null,
      };
      let res: { ok: boolean; reason?: string; resendId?: string | null };
      if (r.kind === 'yape_recovery') {
        if (!r.order_id) { await markFailed(r.id, 'no_order_id'); failed++; return; }
        res = await sendYapeRecoveryEmail({
          to: r.recipient_email, buyerName: r.recipient_name,
          eventName: String(p.event_name ?? ''), eventSlug: String(p.event_slug ?? ''),
          brand: brandForEmail, orderId: r.order_id, idempotencyKey: r.dedupe_key,
        });
      } else if (r.kind === 'yape_pending_digest') {
        if (!r.event_id) { await markFailed(r.id, 'no_event_id'); failed++; return; }
        res = await sendYapePendingDigestEmail({
          to: r.recipient_email, eventName: String(p.event_name ?? ''), eventId: r.event_id,
          brand: brandForEmail, pendingCount: Number(p.pending_count ?? 0), idempotencyKey: r.dedupe_key,
        });
      } else if (r.kind === 'event_reminder') {
        res = await sendEventReminderEmail({
          to: r.recipient_email, buyerName: r.recipient_name,
          eventName: String(p.event_name ?? ''), eventSlug: String(p.event_slug ?? ''),
          startsAtIso: String(p.starts_at ?? ''), venue: (p.venue as string | null) ?? null,
          brand: brandForEmail, idempotencyKey: r.dedupe_key,
        });
      } else if (r.kind === 'event_cancelled') {
        res = await sendEventCancelledEmail({
          to: r.recipient_email, buyerName: r.recipient_name,
          eventName: String(p.event_name ?? ''), startsAtIso: String(p.starts_at ?? ''),
          reason: (p.reason as string | null) ?? null,
          brand: brandForEmail, idempotencyKey: r.dedupe_key,
        });
      } else {
        await markFailed(r.id, `unknown_kind:${r.kind}`); failed++; return;
      }
      if (res.ok) { await markSent(r.id, res.resendId ?? null); sent++; }
      else { await markFailed(r.id, res.reason ?? 'unknown'); failed++; }
    }));
  }

  return NextResponse.json({ ok: true, enqueued, enqueuedReminders, claimed: rows.length, sent, failed, enqueue_error: enqErr?.message ?? null, reminder_enqueue_error: remErr?.message ?? null });
}
