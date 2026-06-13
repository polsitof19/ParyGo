'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { isImpersonating } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { issueTicketsForOrder, markOrderPaid } from '@/lib/tickets';
import { sendTicketEmail } from '@/lib/email/sendTicketEmail';
import { sendYapeRejectedEmail } from '@/lib/email/sendYapeRejectedEmail';

type ApproveResult =
  | { ok: true; ticketsIssued: number; alreadyIssued: boolean }
  | { ok: false; message: string };

type RejectResult = { ok: boolean; message?: string };

export async function approveYapeProof(proofId: string): Promise<ApproveResult> {
  const user = await requireSession();
  const admin = createAdminClient();

  // Fetch proof + verify the user is brand_admin of its brand.
  const { data: proof, error: proofErr } = await admin
    .from('yape_proofs')
    .select('id, brand_id, order_id, status')
    .eq('id', proofId)
    .single();
  if (proofErr || !proof) return { ok: false, message: 'Comprobante no encontrado.' };

  // SOLO-LECTURA en impersonación: el super admin NO puede aprobar/rechazar Yape
  // (escritura de dinero) mientras "ve" la marca. Su camino es por membresía
  // (que no tiene) o super-sin-impersonar. Iguala el patrón de las otras guardas.
  const canAct =
    (user.isSuperAdmin && !isImpersonating()) ||
    user.brandMemberships.some(
      (m) => m.brandId === proof.brand_id && m.role === 'brand_admin'
    );
  if (!canAct) return { ok: false, message: 'No tienes permiso.' };

  // Atomic state transition: only flip if still pending. Prevents double-approve
  // if two admin tabs hit it at the same time.
  const { data: updated, error: updErr } = await admin
    .from('yape_proofs')
    .update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', proofId)
    .eq('status', 'pending_review')
    .select('id')
    .single();
  if (updErr || !updated) {
    return {
      ok: false,
      message: 'Este comprobante ya fue procesado (otra ventana lo aprobó/rechazó).',
    };
  }

  // Emisión ATÓMICA primero (idempotente + GATE de cupo, migr 0031). Solo si
  // emite OK marcamos la orden pagada y consumimos la promo. Si el evento se
  // sobrevendió (la reserva expiró y el cupo se revendió antes de esta
  // aprobación) NO se emite ni se marca pagada: revertimos la aprobación del
  // comprobante para que el organizador lo rechace y reembolse el Yape.
  const issue = await issueTicketsForOrder({
    orderId: proof.order_id,
    reason: 'yape_approved',
  });
  if (!issue.ok) {
    if (issue.error === 'oversold_no_capacity') {
      await admin
        .from('yape_proofs')
        .update({ status: 'pending_review', reviewed_by: null, reviewed_at: null })
        .eq('id', proofId);
      return {
        ok: false,
        message:
          'No hay cupo: el evento se agotó. No se emitieron entradas. Rechazá esta orden y reembolsá el Yape.',
      };
    }
    return { ok: false, message: `Tickets fallaron: ${issue.error}` };
  }
  // Emitió OK → marcar pagada + consumir la redención de promo (ambos idempotentes).
  await markOrderPaid(proof.order_id);
  await admin.rpc('mark_promo_redemption_consumed', { p_order_id: proof.order_id });

  await admin.from('events_log').insert({
    brand_id: proof.brand_id,
    order_id: proof.order_id,
    actor_user_id: user.id,
    type: 'yape_approved',
    payload: { proof_id: proofId, tickets_issued: issue.ticketIds.length },
  });

  // Fire the ticket delivery email. Failures here MUST NOT roll back the
  // approval — the order is already paid and the tickets already exist;
  // sendTicketEmail logs structured and leaves email_sent_at null so the
  // operator can retry.
  const emailResult = await sendTicketEmail(proof.order_id);
  if (!emailResult.ok) {
    console.error('[approveYapeProof] sendTicketEmail failed', {
      order_id: proof.order_id,
      reason: emailResult.reason,
    });
  }

  revalidatePath('/admin/yape');
  revalidatePath('/admin');
  return {
    ok: true,
    ticketsIssued: issue.ticketIds.length,
    alreadyIssued: issue.alreadyIssued,
  };
}

export async function rejectYapeProof(proofId: string, reason: string): Promise<RejectResult> {
  const user = await requireSession();
  const admin = createAdminClient();
  reason = (reason ?? '').slice(0, 300); // límite de longitud (defensa)

  const { data: proof } = await admin
    .from('yape_proofs')
    .select('id, brand_id, order_id, status')
    .eq('id', proofId)
    .single();
  if (!proof) return { ok: false, message: 'No encontrado.' };

  // SOLO-LECTURA en impersonación: el super admin NO puede aprobar/rechazar Yape
  // (escritura de dinero) mientras "ve" la marca. Su camino es por membresía
  // (que no tiene) o super-sin-impersonar. Iguala el patrón de las otras guardas.
  const canAct =
    (user.isSuperAdmin && !isImpersonating()) ||
    user.brandMemberships.some(
      (m) => m.brandId === proof.brand_id && m.role === 'brand_admin'
    );
  if (!canAct) return { ok: false, message: 'Sin permiso.' };

  const { data: updated } = await admin
    .from('yape_proofs')
    .update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      reject_reason: reason || null,
    })
    .eq('id', proofId)
    .eq('status', 'pending_review')
    .select('id')
    .single();
  if (!updated) {
    return { ok: false, message: 'Ya procesado.' };
  }

  // Mark order failed and release the held reservation so the stock returns.
  await admin
    .from('orders')
    .update({ status: 'failed' })
    .eq('id', proof.order_id)
    .eq('status', 'pending_yape_review');
  await admin.rpc('release_stock_reservations_for_order', { p_order_id: proof.order_id });
  await admin.rpc('release_promo_redemption_for_order', { p_order_id: proof.order_id });

  await admin.from('events_log').insert({
    brand_id: proof.brand_id,
    order_id: proof.order_id,
    actor_user_id: user.id,
    type: 'yape_rejected',
    payload: { proof_id: proofId, reason },
  });

  // Avisar al comprador del rechazo (best-effort: si el email falla NO revierte
  // el rechazo; la orden ya quedó 'failed' y el stock liberado).
  const emailRes = await sendYapeRejectedEmail(proof.order_id, reason || null);
  if (!emailRes.ok) {
    console.error('[rejectYapeProof] sendYapeRejectedEmail failed', { order_id: proof.order_id, reason: emailRes.reason });
  }

  revalidatePath('/admin/yape');
  return { ok: true };
}
