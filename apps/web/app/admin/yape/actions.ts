'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { issueTicketsForOrder, markOrderPaid } from '@/lib/tickets';
import { sendTicketEmail } from '@/lib/email/sendTicketEmail';

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

  const canAct =
    user.isSuperAdmin ||
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

  // Mark order paid + issue tickets (both idempotent).
  await markOrderPaid(proof.order_id);
  // If the order used a promo code, confirm its redemption (held → consumed).
  await admin.rpc('mark_promo_redemption_consumed', { p_order_id: proof.order_id });
  const issue = await issueTicketsForOrder({
    orderId: proof.order_id,
    reason: 'yape_approved',
  });
  if (!issue.ok) {
    return { ok: false, message: `Tickets fallaron: ${issue.error}` };
  }

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

  const { data: proof } = await admin
    .from('yape_proofs')
    .select('id, brand_id, order_id, status')
    .eq('id', proofId)
    .single();
  if (!proof) return { ok: false, message: 'No encontrado.' };

  const canAct =
    user.isSuperAdmin ||
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

  // TODO(emails): notify buyer of rejection

  revalidatePath('/admin/yape');
  return { ok: true };
}
