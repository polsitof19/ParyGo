'use server';

import { revalidatePath } from 'next/cache';
import { requireSession, type SessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeEscribirComoSuper, type ModoEscrituraSuper } from '@/lib/impersonation';
import { auditarEscrituraSuper } from '@/lib/auditoriaSuper';
import { sendPromoCodeEmail } from '@/lib/email/sendPromoCodeEmail';
import { textosPanel } from '@/lib/idiomaServer';

type CreateResult = { ok: true; id: string } | { ok: false; message: string };
type RevokeResult = { ok: boolean; message?: string };
export type SendCodeResult = { ok: boolean; message: string };

// Enviar un código de promotor por email. Brand-scoped: el código debe ser de
// un evento de la marca del brand_admin (autorización por sesión, no por form).
export async function sendPromoCodeByEmailAction(
  promoCodeId: string,
  eventId: string,
  email: string
): Promise<SendCodeResult> {
  const user = await requireSession();
  const { t } = await textosPanel();
  const auth = await authorizeEventBrandAdmin(eventId, user);
  const brandId = auth?.brandId ?? null;
  if (!brandId) return { ok: false, message: t('No tienes permiso sobre este evento.', 'You do not have permission over this event.') };

  const to = (email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, message: t('Email inválido.', 'Invalid email.') };

  const admin = createAdminClient();
  // El código debe pertenecer a ESTE evento (que ya verificamos es de la marca).
  const { data: code } = await admin
    .from('promo_codes')
    .select('id, code, event_id')
    .eq('id', promoCodeId)
    .maybeSingle();
  if (!code || code.event_id !== eventId) {
    return { ok: false, message: t('Ese código no es de este evento.', 'That code does not belong to this event.') };
  }

  const res = await sendPromoCodeEmail(promoCodeId, to);
  if (!res.ok) return { ok: false, message: t('No se pudo enviar el email. Prueba de nuevo.', 'Could not send the email. Try again.') };
  if (res.status === 'skipped') return { ok: false, message: t('El email no está configurado.', 'Email is not configured.') };

  await admin.from('events_log').insert({
    brand_id: brandId,
    event_id: eventId,
    actor_user_id: user.id,
    type: 'promo_code_emailed',
    payload: { code: code.code, to },
  });
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId, accion: 'promo_code_emailed', diff: { code: code.code, to } });

  return { ok: true, message: t(`Código ${code.code} enviado a ${to}.`, `Code ${code.code} sent to ${to}.`) };
}

export type CreatePromoInput = {
  eventId: string;
  code: string;
  label: string;
  discountType: 'percent' | 'fixed' | 'free';
  // For percent: 1..100. For fixed: amount in SOLES (we convert to cents). Ignored for free.
  discountValue: number;
  // null = unlimited
  maxUses: number | null;
  perEmailLimit: number;
  appliesToAll: boolean;
  ticketTypeIds: string[];
  // ISO date string or empty
  expiresAt: string;
};

// Verify the caller is brand_admin of the event's brand. Returns the brand_id
// on success so the action can scope its writes; returns null when forbidden.
async function authorizeEventBrandAdmin(eventId: string, user: SessionUser) {
  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return null;
  // El dueño por membresía, o el super admin: desde la cabina, o dentro de la
  // marca con el modo edición encendido. Viéndola sin ese modo, no pasa.
  const brandId = event.brand_id as string;
  const esDuenio = user.brandMemberships.some((m) => m.brandId === brandId && m.role === 'brand_admin');
  if (esDuenio) return { brandId, modo: null as ModoEscrituraSuper | null };
  const modo = puedeEscribirComoSuper(user, brandId);
  return modo ? { brandId, modo } : null;
}

export async function createPromoCode(input: CreatePromoInput): Promise<CreateResult> {
  const user = await requireSession();
  const { t } = await textosPanel();
  const admin = createAdminClient();

  const auth = await authorizeEventBrandAdmin(input.eventId, user);
  const brandId = auth?.brandId ?? null;
  if (!brandId) return { ok: false, message: t('No tienes permiso sobre este evento.', 'You do not have permission over this event.') };

  // ---- Server-side validation (never trust the client) ----
  const code = (input.code ?? '').trim();
  if (code.length < 2 || code.length > 32) {
    return { ok: false, message: t('El código debe tener entre 2 y 32 caracteres.', 'The code must be between 2 and 32 characters.') };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(code)) {
    return { ok: false, message: t('El código solo admite letras, números, guion y guion bajo.', 'The code only allows letters, numbers, hyphen and underscore.') };
  }

  let discountValue = 0;
  if (input.discountType === 'percent') {
    discountValue = Math.round(input.discountValue);
    if (discountValue < 1 || discountValue > 100) {
      return { ok: false, message: t('El porcentaje debe estar entre 1 y 100.', 'The percentage must be between 1 and 100.') };
    }
  } else if (input.discountType === 'fixed') {
    // UI sends soles; store cents.
    discountValue = Math.round(input.discountValue * 100);
    if (discountValue < 1) {
      return { ok: false, message: t('El monto fijo debe ser mayor a cero.', 'The fixed amount must be greater than zero.') };
    }
  } else {
    discountValue = 0; // free
  }

  let maxUses: number | null = null;
  if (input.maxUses !== null && input.maxUses !== undefined) {
    maxUses = Math.round(input.maxUses);
    if (maxUses < 1) return { ok: false, message: t('El límite de usos debe ser mayor a cero.', 'The usage limit must be greater than zero.') };
  }

  const perEmailLimit = Math.max(1, Math.round(input.perEmailLimit || 1));

  let expiresAt: string | null = null;
  if (input.expiresAt && input.expiresAt.trim()) {
    const d = new Date(input.expiresAt);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, message: t('Fecha de expiración inválida.', 'Invalid expiration date.') };
    }
    expiresAt = d.toISOString();
  }

  const appliesToAll = input.appliesToAll;
  let ticketTypeIds: string[] | null = null;
  if (!appliesToAll) {
    ticketTypeIds = (input.ticketTypeIds ?? []).filter(Boolean);
    if (ticketTypeIds.length === 0) {
      return { ok: false, message: t('Elige al menos un tipo de entrada o aplica a todas.', 'Choose at least one ticket type or apply to all.') };
    }
    // Enforce that every ticket type belongs to this event.
    const { data: validTypes } = await admin
      .from('ticket_types')
      .select('id')
      .eq('event_id', input.eventId)
      .in('id', ticketTypeIds);
    const validIds = new Set((validTypes ?? []).map((tt) => tt.id));
    if (ticketTypeIds.some((id) => !validIds.has(id))) {
      return { ok: false, message: t('Algún tipo de entrada no pertenece a este evento.', 'Some ticket type does not belong to this event.') };
    }
  }

  const { data, error } = await admin.rpc('create_promo_code', {
    p_event_id: input.eventId,
    p_brand_id: brandId,
    p_code: code,
    p_label: (input.label ?? '').trim(),
    p_discount_type: input.discountType,
    p_discount_value: discountValue,
    p_max_uses: maxUses,
    p_per_email_limit: perEmailLimit,
    p_applies_to_all: appliesToAll,
    p_ticket_type_ids: ticketTypeIds,
    p_expires_at: expiresAt,
    p_created_by: user.id,
  });

  if (error) {
    // 23505 = unique_violation (duplicate code for this event)
    if ((error as { code?: string }).code === '23505') {
      return { ok: false, message: t('Ya existe un código con ese nombre en este evento.', 'A code with that name already exists in this event.') };
    }
    return { ok: false, message: t('No se pudo crear el código. Intenta de nuevo.', 'Could not create the code. Try again.') };
  }
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId: input.eventId, accion: 'promo_code_created', diff: { promo_code_id: data, code, discount_type: input.discountType, discount_value: discountValue } });

  revalidatePath(`/admin/events/${input.eventId}`);
  revalidatePath(`/admin/events/${input.eventId}/promotores`);
  return { ok: true, id: data as string };
}

export async function revokePromoCode(promoCodeId: string, eventId: string): Promise<RevokeResult> {
  const user = await requireSession();
  const { t } = await textosPanel();
  const admin = createAdminClient();

  const auth = await authorizeEventBrandAdmin(eventId, user);
  const brandId = auth?.brandId ?? null;
  if (!brandId) return { ok: false, message: t('No tienes permiso.', 'You do not have permission.') };

  // Scope the update to this brand + event so a forged id can't touch another
  // brand's code. Revoking only flips is_active; existing redemptions stand.
  const { data: updated, error } = await admin
    .from('promo_codes')
    .update({ is_active: false })
    .eq('id', promoCodeId)
    .eq('event_id', eventId)
    .eq('brand_id', brandId)
    .select('id')
    .maybeSingle();

  if (error || !updated) {
    return { ok: false, message: t('No se pudo desactivar el código.', 'Could not deactivate the code.') };
  }
  await auditarEscrituraSuper(admin, { user, modo: auth?.modo ?? null, brandId, eventId, accion: 'promo_code_revoked', diff: { promo_code_id: promoCodeId } });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/promotores`);
  return { ok: true };
}
