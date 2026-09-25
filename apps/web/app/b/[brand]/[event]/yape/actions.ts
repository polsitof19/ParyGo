'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { nanoid } from 'nanoid';
import { createAdminClient } from '@/lib/supabase/admin';
import { solesToCents } from '@/lib/utils';

type Result =
  | { ok: true; redirectUrl: string }
  | { ok: false; message: string };

const schema = z.object({
  order_id: z.string().uuid(),
  amount_soles: z.string().min(1),
  operation_number: z.string().min(3).max(40),
  payer_name: z.string().min(2).max(120),
  security_code: z.string().min(2).max(20),
});

export async function submitYapeProof(formData: FormData): Promise<Result> {
  const brandSlugFromHost = headers().get('x-parygo-brand-slug');
  const parsed = schema.safeParse({
    order_id: formData.get('order_id'),
    amount_soles: formData.get('amount_soles'),
    operation_number: formData.get('operation_number'),
    payer_name: formData.get('payer_name'),
    security_code: formData.get('security_code'),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors[0]?.message ?? 'Datos inválidos' };
  }

  const file = formData.get('receipt_file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Falta la captura del comprobante.' };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, message: 'La captura supera 5 MB.' };
  }

  const admin = createAdminClient();

  // 1. Verify order exists and is in expected state.
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select(`
      id, event_id, brand_id, total_cents, status, payment_method,
      brand:brands ( slug )
    `)
    .eq('id', parsed.data.order_id)
    .single();
  if (orderErr || !order) {
    return { ok: false, message: 'Orden no encontrada.' };
  }
  if (order.payment_method !== 'yape_manual') {
    return { ok: false, message: 'Esta orden no es Yape manual.' };
  }
  if (order.status !== 'pending_yape_review') {
    return { ok: false, message: 'Esta orden ya fue procesada.' };
  }
  // Cross-brand guard: the order must belong to the brand subdomain the
  // request came from. Prevents someone submitting yape proofs against
  // another brand's order queue.
  const orderBrand = Array.isArray(order.brand) ? order.brand[0] : order.brand;
  if (brandSlugFromHost && orderBrand?.slug && orderBrand.slug !== brandSlugFromHost) {
    return { ok: false, message: 'Orden no pertenece a esta marca.' };
  }

  // 2. Compute amount and warn if mismatched (but still accept; promoter can reject).
  const amountCents = solesToCents(parsed.data.amount_soles);

  // 3. Upload image to Storage (private bucket).
  const ext =
    {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'image/heif': 'heif',
    }[file.type] ?? 'bin';
  const storagePath = `${order.brand_id}/${order.id}/${nanoid(12)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage
    .from('yape-proofs')
    .upload(storagePath, bytes, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });
  if (uploadErr) {
    return { ok: false, message: `No se pudo subir la captura: ${uploadErr.message}` };
  }

  // 4. Insert yape_proof row + link from order.
  // Generate a private signed URL (yape-proofs bucket is private; admin reads via storage API).
  const receiptUrl = storagePath;
  const { data: proof, error: proofErr } = await admin
    .from('yape_proofs')
    .insert({
      order_id: order.id,
      brand_id: order.brand_id,
      amount_cents: amountCents,
      operation_number: parsed.data.operation_number.trim(),
      payer_name: parsed.data.payer_name.trim(),
      security_code: parsed.data.security_code.trim(),
      receipt_url: receiptUrl,
      status: 'pending_review',
    })
    .select('id')
    .single();
  if (proofErr || !proof) {
    return { ok: false, message: proofErr?.message ?? 'No se pudo registrar.' };
  }

  await admin.from('orders').update({ yape_proof_id: proof.id }).eq('id', order.id);

  await admin.from('events_log').insert({
    brand_id: order.brand_id,
    event_id: order.event_id,
    order_id: order.id,
    type: 'yape_proof_submitted',
    payload: {
      amount_cents: amountCents,
      expected_cents: order.total_cents,
      match: amountCents === order.total_cents,
    },
  });

  // 5. Get event slug for redirect.
  const { data: event } = await admin
    .from('events')
    .select('slug, name')
    .eq('id', order.event_id)
    .single();

  await avisarAlOrganizador(admin, { brandId: order.brand_id, eventId: order.event_id, eventName: event?.name ?? '', eventSlug: event?.slug ?? '', orderId: order.id });

  return {
    ok: true,
    redirectUrl: `/${event?.slug ?? ''}/confirmacion?order=${order.id}`,
  };
}

// Aviso AL TOQUE al organizador: un email por orden con comprobante (lo manda el
// worker de la cola, que corre cada minuto). Antes solo existía el resumen cada
// 6 h. Respeta la casilla de "Mi marca" (notify_yape_digest) y nunca frena al
// comprador: si encolar falla, su comprobante ya quedó guardado igual.
async function avisarAlOrganizador(
  admin: ReturnType<typeof createAdminClient>,
  a: { brandId: string; eventId: string; eventName: string; eventSlug: string; orderId: string }
) {
  try {
    const { data: brand } = await admin
      .from('brands')
      .select('name, slug, contact_email, notify_yape_digest')
      .eq('id', a.brandId)
      .maybeSingle();
    if (!brand?.notify_yape_digest || !brand.contact_email?.trim()) return;
    const { count } = await admin
      .from('yape_proofs')
      .select('id, order:orders!yape_proofs_order_id_fkey!inner ( event_id )', { count: 'exact', head: true })
      .eq('brand_id', a.brandId)
      .eq('status', 'pending_review')
      .eq('order.event_id', a.eventId);
    await admin.from('notification_jobs').insert({
      kind: 'yape_pending_digest',
      brand_id: a.brandId,
      event_id: a.eventId,
      order_id: null,
      recipient_email: brand.contact_email.trim().toLowerCase(),
      recipient_name: brand.name ?? '',
      payload: { event_name: a.eventName, event_slug: a.eventSlug, brand_slug: brand.slug, pending_count: Math.max(1, count ?? 1) },
      // Uno por ORDEN, no por comprobante: subir el comprobante es público y una
      // orden admite varios; por comprobante se podía llenarle la bandeja.
      dedupe_key: `yape_pending_digest:${a.eventId}:order:${a.orderId}`,
      status: 'pending',
    });
  } catch (e) {
    console.error('[yape] no se pudo encolar el aviso al organizador', e);
  }
}
