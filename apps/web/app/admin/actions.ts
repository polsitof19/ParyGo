'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { isImpersonating } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { issueTicketsForOrder } from '@/lib/tickets';
import { sendTicketEmail } from '@/lib/email/sendTicketEmail';
import { publicEnv } from '@/lib/env';

export type InviteValidatorState = { ok: boolean; message: string | null };
export type ReissueState = { ok: boolean; message: string | null };
export type VoidTicketState = { ok: boolean; message: string | null };

// =============================================================
// ANULAR una entrada (su QR deja de valer en puerta).
// Política por defecto (segura): anular = marcar el ticket invalidado para que
// validate_ticket lo rechace (estado INVALIDATED). NO toca dinero: ParyGo no
// mueve la plata; la devolución del Yape/MP la gestiona el organizador por fuera.
// Seguridad:
//  - Solo brand_admin; el brand sale de la SESIÓN, nunca del form.
//  - Se verifica que el ticket sea de ESA marca (no se puede anular de otra).
//  - UPDATE atómico y brand-scoped (WHERE id + brand_id + invalidated_at IS NULL):
//    idempotente y serializado con el FOR UPDATE de validate_ticket por el lock de
//    fila (anular + escanear a la vez → uno gana, el otro ve el estado correcto).
//  - Auditoría en events_log (quién anuló, motivo).
// =============================================================
export async function voidTicketAction(
  _prev: VoidTicketState,
  formData: FormData
): Promise<VoidTicketState> {
  const user = await requireSession();
  // SOLO-LECTURA en impersonación: anular un ticket es escritura de acceso →
  // denegada mientras el super admin "ve" una marca (defensa explícita, no solo
  // por ausencia de membership).
  if (isImpersonating()) return { ok: false, message: 'No autorizado durante impersonación.' };
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) return { ok: false, message: 'No autorizado.' };

  const ticketId = String(formData.get('ticket_id') ?? '');
  const reason = String(formData.get('reason') ?? '').slice(0, 200);
  if (!ticketId) return { ok: false, message: 'Entrada inválida.' };

  const admin = createAdminClient();
  // Verificación de pertenencia: el ticket debe ser de la marca de la sesión.
  const { data: tk } = await admin
    .from('tickets')
    .select('id, brand_id, event_id, order_id, invalidated_at, ticket_number')
    .eq('id', ticketId)
    .maybeSingle();
  if (!tk || tk.brand_id !== membership.brandId) {
    return { ok: false, message: 'Esa entrada no es de tu marca.' };
  }
  if (tk.invalidated_at) {
    return { ok: true, message: 'Esa entrada ya estaba anulada.' };
  }

  // UPDATE atómico + brand-scoped + idempotente.
  const { data: updated, error } = await admin
    .from('tickets')
    .update({ invalidated_at: new Date().toISOString() })
    .eq('id', ticketId)
    .eq('brand_id', membership.brandId)
    .is('invalidated_at', null)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, message: 'No se pudo anular la entrada.' };
  if (!updated) return { ok: true, message: 'Esa entrada ya estaba anulada.' };

  await admin.from('events_log').insert({
    brand_id: membership.brandId,
    event_id: tk.event_id,
    ticket_id: tk.id,
    order_id: tk.order_id,
    actor_user_id: user.id,
    type: 'ticket_voided',
    payload: { ticket_number: tk.ticket_number, reason: reason || null },
  });

  revalidatePath(`/admin/events/${tk.event_id}/clientes`);
  revalidatePath(`/admin/events/${tk.event_id}`);
  return { ok: true, message: 'Entrada anulada. Su QR ya no vale en puerta. La devolución del dinero la gestionás vos por tu Yape/MercadoPago.' };
}

// =============================================================
// Recuperación: re-emitir tickets de una orden PAGADA sin tickets.
// Red de seguridad para el flujo Yape (no atómico): si el proceso muere entre
// "orden pagada" y "tickets emitidos", el dueño la recupera con un clic.
// Seguridad: brand_admin de SU marca (el brand sale de la sesión, y se verifica
// que la orden pertenezca a esa marca). issueTicketsForOrder es idempotente
// (si ya hay tickets, no duplica). NO marca la orden pagada (solo emite sobre
// órdenes que YA están 'paid') → no crea dinero.
// =============================================================
export async function reissueTicketsAction(
  _prev: ReissueState,
  formData: FormData
): Promise<ReissueState> {
  const user = await requireSession();
  // SOLO-LECTURA en impersonación: re-emitir tickets es escritura → denegada.
  if (isImpersonating()) return { ok: false, message: 'No autorizado durante impersonación.' };
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) return { ok: false, message: 'No autorizado.' };

  const orderId = String(formData.get('order_id') ?? '');
  if (!orderId) return { ok: false, message: 'Orden inválida.' };

  const admin = createAdminClient();
  // Tenancy + estado: la orden debe ser de ESTA marca y estar pagada.
  const { data: order } = await admin
    .from('orders')
    .select('id, brand_id, status')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || order.brand_id !== membership.brandId) {
    return { ok: false, message: 'Esa orden no es de tu marca.' };
  }
  if (order.status !== 'paid') {
    return { ok: false, message: 'Solo se pueden re-emitir tickets de órdenes pagadas.' };
  }

  const res = await issueTicketsForOrder({ orderId, reason: 'yape_approved' });
  if (!res.ok) return { ok: false, message: `No se pudieron re-emitir: ${res.error}` };

  // Mandar el email con el QR (best-effort: si falla, los tickets ya existen).
  try { await sendTicketEmail(orderId); } catch { /* el dueño puede reenviar aparte */ }

  await admin.from('events_log').insert({
    brand_id: membership.brandId,
    order_id: orderId,
    actor_user_id: user.id,
    type: 'tickets_reissued_recovery',
    payload: { already_existed: res.alreadyIssued, count: res.ticketIds.length },
  });

  revalidatePath('/admin');
  return {
    ok: true,
    message: res.alreadyIssued
      ? 'Esa orden ya tenía tickets. Reenviamos el email con el QR.'
      : `Tickets re-emitidos (${res.ticketIds.length}) y email enviado.`,
  };
}
export type GateCodeState = { ok: boolean; message: string | null; code?: string; label?: string };
export type SetPwdState = { ok: boolean; message: string | null };

// brand_admin sets the password of one of THEIR validators (brand from session).
export async function setValidatorPasswordAction(
  _prev: SetPwdState,
  formData: FormData
): Promise<SetPwdState> {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) return { ok: false, message: 'No autorizado.' };
  const userId = String(formData.get('user_id') ?? '');
  const password = String(formData.get('password') ?? '');
  if (password.length < 8) return { ok: false, message: 'Mínimo 8 caracteres.' };

  const admin = createAdminClient();
  // Target MUST be a validator of THIS brand.
  const { data: m } = await admin
    .from('brand_members')
    .select('id').eq('brand_id', membership.brandId).eq('user_id', userId).eq('role', 'validator')
    .maybeSingle();
  if (!m) return { ok: false, message: 'Ese validador no es de tu marca.' };

  const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
  if (error) return { ok: false, message: 'No se pudo actualizar la contraseña.' };
  revalidatePath('/admin');
  return { ok: true, message: 'Contraseña actualizada.' };
}

// brand_admin generates a PERSONAL door code for one of THEIR validators (a
// real account), one active code at a time → traceability per person.
export async function generatePersonalCodeAction(
  _prev: GateCodeState,
  formData: FormData
): Promise<GateCodeState> {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) return { ok: false, message: 'No autorizado.' };
  const brandId = membership.brandId;
  const userId = String(formData.get('user_id') ?? '');

  const admin = createAdminClient();
  const { data: m } = await admin
    .from('brand_members')
    .select('display_name').eq('brand_id', brandId).eq('user_id', userId).eq('role', 'validator')
    .maybeSingle();
  if (!m) return { ok: false, message: 'Ese validador no es de tu marca.' };

  // One active code per validator: revoke any previous active one.
  await admin
    .from('validator_codes')
    .update({ expires_at: new Date().toISOString() })
    .eq('brand_id', brandId).eq('user_id', userId).gt('expires_at', new Date().toISOString());

  const { data, error } = await admin.rpc('generate_validator_code', {
    p_brand_id: brandId, p_user_id: userId, p_device_label: m.display_name ?? 'Validador',
    p_created_by: user.id, p_ttl_minutes: 720, p_max_uses: 500,
  });
  const res = data as { ok?: boolean; code?: string } | null;
  if (error || !res?.ok || !res.code) return { ok: false, message: 'No se pudo generar el código.' };
  revalidatePath('/admin');
  return { ok: true, code: res.code, label: m.display_name ?? 'Validador', message: '' };
}

const schema = z.object({ email: z.string().email() });

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'puesto';

// brand_admin generates a 6-digit door code bound to an ephemeral "puesto"
// validator user of THEIR brand (brand from session, never the form).
export async function generateGateCodeAction(
  _prev: GateCodeState,
  formData: FormData
): Promise<GateCodeState> {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) return { ok: false, message: 'No tenés acceso de promotor.' };
  const brandId = membership.brandId;
  const label = (String(formData.get('device_label') ?? '').trim() || 'Puerta').slice(0, 40);

  const admin = createAdminClient();
  const email = `gate-${brandId.slice(0, 8)}-${slugify(label)}@gate.parygo.local`;

  let userId: string | undefined;
  const created = await admin.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { gate: true, brand_id: brandId, label },
  });
  if (created.data?.user) userId = created.data.user.id;
  else {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
  }
  if (!userId) return { ok: false, message: 'No se pudo crear el puesto.' };

  await admin.from('user_profiles').upsert({ user_id: userId, is_super_admin: false, display_name: label }, { onConflict: 'user_id' });
  // ENFORCEMENT: the puesto user is ALWAYS a validator of this brand, never more.
  await admin.from('brand_members').upsert({ brand_id: brandId, user_id: userId, role: 'validator', display_name: label }, { onConflict: 'brand_id,user_id' });

  const { data, error } = await admin.rpc('generate_validator_code', {
    p_brand_id: brandId, p_user_id: userId, p_device_label: label, p_created_by: user.id,
    p_ttl_minutes: 720, p_max_uses: 200,
  });
  const res = data as { ok?: boolean; code?: string } | null;
  if (error || !res?.ok || !res.code) return { ok: false, message: error?.message ?? 'No se pudo generar el código.' };

  revalidatePath('/admin');
  return { ok: true, code: res.code, label, message: `Código para "${label}": ${res.code}` };
}

export async function revokeGateCodeAction(
  _prev: GateCodeState,
  formData: FormData
): Promise<GateCodeState> {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) return { ok: false, message: 'No autorizado.' };
  const id = String(formData.get('code_id') ?? '');
  const admin = createAdminClient();
  // Scoped to the admin's brand inside the RPC (p_brand_id from session).
  await admin.rpc('revoke_validator_code', { p_id: id, p_brand_id: membership.brandId });
  revalidatePath('/admin');
  return { ok: true, message: 'Código revocado.' };
}

export async function inviteValidatorAction(
  _prev: InviteValidatorState,
  formData: FormData
): Promise<InviteValidatorState> {
  const user = await requireSession();
  // ENFORCEMENT: brand from the session, never the form. A brand_admin can only
  // add validators to THEIR OWN brand.
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) return { ok: false, message: 'No tenés acceso de promotor.' };
  const brandId = membership.brandId;

  const parsed = schema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { ok: false, message: 'Email inválido.' };
  const email = parsed.data.email;

  const admin = createAdminClient();

  // Invite (creates the auth user if needed); validators land on /scan.
  const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/scan`,
  });

  let userId: string | undefined;
  if (inviteErr && inviteErr.message?.toLowerCase().includes('already')) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    if (!userId) return { ok: false, message: 'El usuario existe pero no se pudo localizar.' };
  } else if (inviteErr || !invite?.user) {
    return { ok: false, message: inviteErr?.message ?? 'No se pudo invitar.' };
  } else {
    userId = invite.user.id;
  }

  const { error: memberErr } = await admin
    .from('brand_members')
    .upsert(
      { brand_id: brandId, user_id: userId, role: 'validator', display_name: email },
      { onConflict: 'brand_id,user_id' }
    );
  if (memberErr) return { ok: false, message: memberErr.message };

  await admin.from('events_log').insert({
    brand_id: brandId,
    actor_user_id: user.id,
    type: 'validator_invited',
    payload: { email },
  });

  revalidatePath('/admin');
  return { ok: true, message: `Validador invitado: ${email}. Recibe un link para entrar al escáner.` };
}
