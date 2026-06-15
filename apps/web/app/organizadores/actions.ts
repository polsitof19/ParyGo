'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

// =============================================================
// "Pedir acceso" de organizadores (TANDA 3, Grupo C) — form PÚBLICO
// =============================================================
// Crea SOLO una solicitud en la cola (access_requests). NUNCA crea la marca ni
// asigna saldo: eso lo hace Paul (super admin) al aprobar, reusando el alta.
// Anti-abuso: rate-limit atómico en el RPC (por email + IP) + honeypot + validación.
// Respuesta SIEMPRE neutra (no revela si se aceptó o se limitó).
// =============================================================

const schema = z.object({
  brand_name: z.string().trim().min(2, 'Contanos el nombre de tu marca o evento.').max(120),
  contact_name: z.string().trim().min(2, 'Tu nombre, porfa.').max(120),
  contact_email: z.string().trim().email('Email inválido.').max(200),
  contact_phone: z.string().trim().max(40).optional().or(z.literal('')),
  event_info: z.string().trim().max(1000).optional().or(z.literal('')),
});

export type RequestAccessState = { ok: boolean; message: string; fieldErrors?: Partial<Record<string, string>> };

const NEUTRAL =
  '¡Gracias! Recibimos tu solicitud. Si encaja, te contactamos para darte acceso. Revisá tu email y WhatsApp.';

export async function requestAccessAction(_prev: RequestAccessState, formData: FormData): Promise<RequestAccessState> {
  // Honeypot: un campo oculto que un humano nunca llena. Si viene con algo → bot.
  // Respondemos neutro sin tocar la cola.
  if (String(formData.get('website') ?? '').trim() !== '') {
    return { ok: true, message: NEUTRAL };
  }

  const parsed = schema.safeParse({
    brand_name: formData.get('brand_name') ?? '',
    contact_name: formData.get('contact_name') ?? '',
    contact_email: formData.get('contact_email') ?? '',
    contact_phone: formData.get('contact_phone') ?? '',
    event_info: formData.get('event_info') ?? '',
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const e of parsed.error.errors) {
      const p = e.path.join('.');
      if (p) fieldErrors[p] = e.message;
    }
    return { ok: false, message: 'Revisá los campos marcados.', fieldErrors };
  }

  const ip =
    headers().get('cf-connecting-ip')?.trim() ||
    headers().get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null;

  const admin = createAdminClient();
  // El RPC encola (o no, si superó el rate-limit). En cualquier caso respondemos
  // neutro: no revelamos si se aceptó, se limitó o falló (anti-oráculo).
  await admin.rpc('submit_access_request', {
    p_brand_name: parsed.data.brand_name,
    p_contact_name: parsed.data.contact_name,
    p_contact_email: parsed.data.contact_email,
    p_contact_phone: parsed.data.contact_phone || null,
    p_event_info: parsed.data.event_info || null,
    p_ip: ip,
  });

  return { ok: true, message: NEUTRAL };
}
