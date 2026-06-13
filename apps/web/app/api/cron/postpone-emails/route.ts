import { NextResponse, type NextRequest } from 'next/server';

// =============================================================
// POST /api/cron/postpone-emails  — WORKER de la cola de avisos de postergación
// =============================================================
// Disparado por pg_cron (vía pg_net.http_post) cada minuto. Procesa UNA tanda de
// la cola event_postpone_emails: reclama atómicamente (claim_postpone_emails usa
// FOR UPDATE SKIP LOCKED → dos corridas no toman las mismas filas), envía cada
// aviso con sendEventPostponedEmail (Resend), y marca sent/failed. Los fallidos
// y los 'processing' colgados vuelven a la cola en la próxima corrida (reintento
// acotado a 5 intentos en la RPC). Idempotente: los 'sent' nunca se reprocesan.
//
// AUTH: Bearer CRON_SECRET (server-only). Sin secreto válido → 401. No expone
// datos: solo procesa la cola.
// PII: la lista de compradores ya vive en la cola (RLS service_role only); este
// worker manda a cada uno SU aviso, nunca devuelve ni expone la lista.
// =============================================================

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const BATCH = 50;       // filas por corrida (≈ una tanda por minuto)
const CONCURRENCY = 4;  // envíos en paralelo (respeta el rate limit de Resend)

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { sendEventPostponedEmail } = await import('@/lib/email/sendEventPostponedEmail');
  const admin = createAdminClient();

  // 1. Reclamar una tanda atómicamente.
  const { data: claimed, error } = await admin.rpc('claim_postpone_emails', { p_limit: BATCH });
  if (error) {
    return NextResponse.json({ ok: false, reason: `claim_failed:${error.message}` }, { status: 500 });
  }
  const rows = (claimed ?? []) as Array<{
    id: string; brand_id: string | null; recipient_email: string; recipient_name: string;
    event_name: string; old_date_label: string; new_date_label: string; venue: string | null;
    dedupe_key: string;
  }>;
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, claimed: 0, sent: 0, failed: 0 });
  }

  // 2. Cargar las marcas involucradas UNA vez (datos de la marca, no PII del comprador).
  const brandIds = [...new Set(rows.map((r) => r.brand_id).filter((x): x is string => !!x))];
  const { data: brandsData } = await admin
    .from('brands')
    .select('id, name, slug, whatsapp_e164, contact_email, theme_json')
    .in('id', brandIds);
  const brandById = new Map((brandsData ?? []).map((b) => [b.id, b]));

  // 3. Enviar con concurrencia limitada; marcar sent/failed por fila.
  let sent = 0;
  let failed = 0;
  const nowIso = () => new Date().toISOString();
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const chunk = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (r) => {
        const brand = r.brand_id ? brandById.get(r.brand_id) : null;
        if (!brand) {
          await admin.from('event_postpone_emails').update({ status: 'failed', last_error: 'brand_not_found' }).eq('id', r.id);
          failed++;
          return;
        }
        const res = await sendEventPostponedEmail({
          to: r.recipient_email,
          buyerName: r.recipient_name,
          eventName: r.event_name,
          newDateLabel: r.new_date_label,
          oldDateLabel: r.old_date_label,
          venue: r.venue,
          brand: {
            name: brand.name,
            slug: brand.slug,
            whatsapp_e164: brand.whatsapp_e164,
            contact_email: brand.contact_email,
            theme_json: brand.theme_json as { primary_color?: string; logo_url?: string | null } | null,
          },
          // Idempotencia de Resend: reintento por crash post-envío NO duplica.
          idempotencyKey: r.dedupe_key,
        });
        if (res.ok) {
          await admin.from('event_postpone_emails')
            .update({ status: 'sent', sent_at: nowIso(), resend_id: res.resendId ?? null, last_error: null })
            .eq('id', r.id);
          sent++;
        } else {
          // Vuelve a 'failed' → el claim lo reintenta (hasta 5 intentos), no se pierde.
          await admin.from('event_postpone_emails')
            .update({ status: 'failed', last_error: res.reason ?? 'unknown' })
            .eq('id', r.id);
          failed++;
        }
      })
    );
  }

  return NextResponse.json({ ok: true, claimed: rows.length, sent, failed });
}
