'use server';

import { headers } from 'next/headers';
import { requireBrand } from '@/lib/brand';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTicketEmail } from '@/lib/email/sendTicketEmail';

// =============================================================
// "Reenviá mi entrada" self-service (TANDA 2, Grupo C) — buyer-facing + PII
// =============================================================
// El comprador que perdió el email pone su email → se le reenvían SUS QR.
// CANDADOS DE SEGURIDAD:
//  (a) Solo al email REGISTRADO: el email tipeado es la BÚSQUEDA; sendTicketEmail
//      manda al order.buyer_email (= el mismo email matcheado). Nunca a un destino
//      libre → nadie puede pedir los QR de otro a su propia casilla.
//  (b) Sin enumeración: la respuesta es SIEMPRE la misma, exista o no el email
//      (salvo formato inválido). No revela si hay entradas ni cuántas.
//  (c) Rate-limit por email (3/h) y por IP (10/h): no se puede usar como oráculo
//      ni para spamear una casilla. Sobre el límite → misma respuesta neutra, sin
//      enviar. Cada intento se registra (incluido el bloqueado) para que el
//      sondeo siga contando.
// Reusa sendTicketEmail (idempotente); forzamos el reenvío limpiando email_sent_at
// de las órdenes pagadas de ESTA marca con ese email. NO toca emisión ni dinero.
// =============================================================

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NEUTRAL =
  'Si hay entradas asociadas a ese email, te las reenviamos. Revisá tu correo (y la carpeta de spam).';
const MAX_PER_EMAIL = 3; // por hora
const MAX_PER_IP = 10; // por hora
const WINDOW_MS = 3_600_000;

export type ResendResult = { ok: boolean; message: string };

export async function resendMyTickets(_prev: ResendResult, formData: FormData): Promise<ResendResult> {
  const brand = await requireBrand(); // 404 si no hay marca (host inválido)
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return { ok: false, message: 'Ingresá un email válido.' };
  }

  const admin = createAdminClient();
  // IP real detrás de Cloudflare: cf-connecting-ip NO es spoofeable por el cliente
  // (x-forwarded-for sí lo es). Fallback a XFF por si cambia el proxy.
  const ip =
    headers().get('cf-connecting-ip')?.trim() ||
    headers().get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null;

  // (c) Rate-limit ATÓMICO (cuenta + registra en una tx con advisory lock por
  // email → sin carrera TOCTOU). Devuelve si está permitido. Registra SIEMPRE el
  // intento (también el bloqueado) para que el sondeo cuente.
  const { data: allowed, error: rlErr } = await admin.rpc('register_ticket_resend_attempt', {
    p_email: email,
    p_ip: ip,
    p_brand_id: brand.id,
    p_max_email: MAX_PER_EMAIL,
    p_max_ip: MAX_PER_IP,
    p_window_secs: Math.floor(WINDOW_MS / 1000),
  });
  // Si el rate-limit falla (error), no enviamos: respuesta neutra (fail-closed).
  if (rlErr || allowed !== true) {
    return { ok: true, message: NEUTRAL };
  }

  // (a) Buscar órdenes PAGADAS de ESTA marca con ese email registrado y reenviar
  // al buyer_email de cada una (= el email matcheado). Tope defensivo de 20.
  const { data: orders } = await admin
    .from('orders')
    .select('id')
    .eq('brand_id', brand.id)
    .eq('buyer_email', email)
    .eq('status', 'paid')
    .limit(20);

  for (const o of orders ?? []) {
    // Forzar el reenvío: limpiar email_sent_at (scopeado a la marca) y enviar.
    await admin.from('orders').update({ email_sent_at: null }).eq('id', o.id).eq('brand_id', brand.id);
    await sendTicketEmail(o.id);
  }

  // (b) Respuesta neutra SIEMPRE, haya o no encontrado órdenes.
  return { ok: true, message: NEUTRAL };
}
