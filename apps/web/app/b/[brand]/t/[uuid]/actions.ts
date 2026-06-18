'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';
import { sendTransferredTicketEmail } from '@/lib/email/sendTransferredTicketEmail';

export type TransferState = { ok: boolean; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Transferir/regalar la entrada cuyo QR (link) tiene quien ejecuta. La posesión
// del qr_code ES la autorización (los compradores no se loguean). Rate-limit por
// entrada + IP; el reemití-QR es atómico server-side (transfer_ticket). Best-effort
// en el email: si falla, igual la entrada quedó transferida (el nuevo dueño puede
// reenviársela desde /reenviar… no — usa el link; mostramos el resultado claro).
export async function transferTicketAction(_prev: TransferState, formData: FormData): Promise<TransferState> {
  const qr = String(formData.get('qr') ?? '').trim().toLowerCase();
  const newName = String(formData.get('new_name') ?? '').trim();
  const newEmail = String(formData.get('new_email') ?? '').trim().toLowerCase();

  if (!UUID_RE.test(qr)) return { ok: false, message: 'Entrada inválida.' };
  if (newName.length < 2 || newName.length > 120) return { ok: false, message: 'Poné el nombre del nuevo dueño.' };
  if (!EMAIL_RE.test(newEmail) || newEmail.length > 200) return { ok: false, message: 'Email del nuevo dueño inválido.' };

  const admin = createAdminClient();
  const h = headers();
  const ip = h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

  // Rate-limit (fail-closed).
  const { data: allowed, error: rlErr } = await admin.rpc('register_ticket_transfer_attempt', {
    p_key: qr, p_ip: ip, p_max_key: 3, p_max_ip: 10, p_window_secs: 3600,
  });
  if (rlErr || allowed !== true) {
    return { ok: false, message: 'Hiciste demasiadas transferencias. Probá de nuevo en un rato.' };
  }

  const { data: res, error } = await admin.rpc('transfer_ticket', { p_qr_code: qr, p_new_name: newName });
  const r = (res ?? null) as { ok?: boolean; reason?: string; new_qr?: string; brand_id?: string; event_id?: string } | null;
  if (error || !r || r.ok !== true || !r.new_qr) {
    const reason = r?.reason;
    const msg =
      reason === 'already_used' ? 'Esta entrada ya fue usada en la puerta; no se puede transferir.'
      : reason === 'invalidated' ? 'Esta entrada ya no es válida.'
      : reason === 'not_allowed' ? 'Este evento no permite transferir entradas.'
      : reason === 'not_found' ? 'Entrada no encontrada.'
      : reason === 'no_name' ? 'Poné el nombre del nuevo dueño.'
      : 'No se pudo transferir la entrada.';
    return { ok: false, message: msg };
  }

  // Enviar el nuevo QR al nuevo dueño (best-effort; la transferencia ya se hizo).
  try {
    const [{ data: brand }, { data: event }] = await Promise.all([
      admin.from('brands').select('name, slug, whatsapp_e164, contact_email, theme_json').eq('id', r.brand_id!).maybeSingle(),
      admin.from('events').select('name, starts_at, venue_name').eq('id', r.event_id!).maybeSingle(),
    ]);
    if (brand?.slug) {
      const ticketUrl = `https://${brand.slug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/t/${r.new_qr}`;
      await sendTransferredTicketEmail({
        to: newEmail,
        newName,
        eventName: event?.name ?? '',
        startsAtIso: (event?.starts_at as string | null) ?? '',
        venue: (event?.venue_name as string | null) ?? null,
        ticketUrl,
        brand: {
          name: brand.name, slug: brand.slug, whatsapp_e164: brand.whatsapp_e164,
          contact_email: brand.contact_email,
          theme_json: brand.theme_json as { primary_color?: string; logo_url?: string | null } | null,
        },
      });
    }
  } catch (e) {
    console.error('transfer email failed', { error: e instanceof Error ? e.message : String(e) });
  }

  return { ok: true, message: `Listo. La entrada quedó a nombre de ${newName} y le enviamos el QR a ${newEmail}. Este enlace ya no es válido.` };
}
