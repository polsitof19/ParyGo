'use server';

import { headers } from 'next/headers';
import { requireBrand } from '@/lib/brand';
import { createAdminClient } from '@/lib/supabase/admin';
import { enqueueTicketEmail } from '@/lib/email/enqueueTicketEmail';

// =============================================================
// "Reenviar a mi email" DESDE LA ENTRADA (/t/<uuid> y la confirmación)
// =============================================================
// Distinto de /reenviar: acá la persona YA tiene la entrada abierta, así que no
// hay nada que buscar ni que adivinar. El QR de la URL es la credencial (URL de
// capacidad) y el correo sale SIEMPRE al email registrado en la orden — nunca a
// uno que se escriba. Nadie puede usar esto para mandarse la entrada de otro.
//
// Por qué existe, más allá de la comodidad: en un evento gratis de miles, el
// email sale por la cola y puede demorar. Esta es la salida del que borró el
// correo o nunca le llegó, sin depender de nadie.
//
// Candados:
//   · la marca sale del host (requireBrand), y el ticket tiene que ser de ESA
//     marca: un QR de otra marca no reenvía nada;
//   · rate-limit ATÓMICO reusando register_ticket_resend_attempt (3/h por email,
//     10/h por IP), el mismo de /reenviar; fail-closed si el RPC falla;
//   · el envío va a la COLA, no al camino del clic: el botón responde al toque
//     aunque Resend esté limitando.
// =============================================================

const MAX_PER_EMAIL = 3;
const MAX_PER_IP = 10;
const VENTANA_SEGS = 3600;

export type ReenvioResult = { ok: boolean; message: string };

// m•••@gmail.com — confirma a dónde va sin exponer el correo entero a quien
// mire la pantalla por encima del hombro.
function enmascarar(email: string): string {
  const [u, d] = email.split('@');
  if (!u || !d) return 'tu correo';
  return `${u.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(3, u.length - 1)))}@${d}`;
}

export async function reenviarMiEntrada(qrCode: string): Promise<ReenvioResult> {
  const brand = await requireBrand();
  const qr = String(qrCode ?? '').trim();
  if (!qr || qr.length > 100) return { ok: false, message: 'Entrada inválida.' };

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('tickets')
    .select('id, order_id, brand_id, invalidated_at')
    .eq('qr_code', qr)
    .maybeSingle();
  if (!ticket || ticket.brand_id !== brand.id) return { ok: false, message: 'Entrada inválida.' };
  if (ticket.invalidated_at) return { ok: false, message: 'Esta entrada fue anulada.' };

  const { data: order } = await admin
    .from('orders')
    .select('id, brand_id, buyer_email, status')
    .eq('id', ticket.order_id)
    .maybeSingle();
  if (!order || order.brand_id !== brand.id || order.status !== 'paid' || !order.buyer_email) {
    return { ok: false, message: 'Entrada inválida.' };
  }

  const ip =
    headers().get('cf-connecting-ip')?.trim() ||
    headers().get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null;

  const { data: permitido, error: rlErr } = await admin.rpc('register_ticket_resend_attempt', {
    p_email: order.buyer_email,
    p_ip: ip,
    p_brand_id: brand.id,
    p_max_email: MAX_PER_EMAIL,
    p_max_ip: MAX_PER_IP,
    p_window_secs: VENTANA_SEGS,
  });
  if (rlErr || permitido !== true) {
    return {
      ok: false,
      message: 'Ya pediste el reenvío varias veces. Espera un rato y revisa tu correo (mira también el spam).',
    };
  }

  // Forzar el reenvío: sendTicketEmail no vuelve a mandar si ya hay
  // email_sent_at, así que se limpia (scopeado a la marca).
  await admin.from('orders').update({ email_sent_at: null }).eq('id', order.id).eq('brand_id', brand.id);
  const encolado = await enqueueTicketEmail(admin, order.id);
  if (!encolado.ok && encolado.reason !== 'duplicate') {
    // Si ni siquiera se pudo encolar, decirlo: la persona tiene su QR en
    // pantalla igual, pero no hay que prometerle un correo que no va a salir.
    return { ok: false, message: 'No pudimos poner el reenvío en cola. Tu entrada sigue acá: guárdala como imagen.' };
  }
  return { ok: true, message: `Listo: te la reenviamos a ${enmascarar(order.buyer_email)}. Puede tardar unos minutos.` };
}
