import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';
import { paypalCobrar } from '@/lib/cobroParygo';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// Vuelta de PayPal tras aprobar el pago de un paquete (0070).
// =============================================================
// PayPal redirige acá con ?token=<orden>. Con intent CAPTURE la plata recién
// se mueve cuando ESTE server cobra la orden: si el comprador no vuelve, no
// se le cobra nada. No exige sesión (puede haber vencido mientras pagaba): lo
// que autoriza es que la orden sea la que el server creó para ESTA compra
// (provider_ref) y que PayPal confirme la captura COMPLETED; el monto y la
// moneda los contrasta settle_pack_purchase contra lo congelado.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const compraId = url.searchParams.get('compra') ?? '';
  const orden = url.searchParams.get('token') ?? '';
  const listo = (estado?: string) =>
    NextResponse.redirect(new URL(`/admin/comprar/listo?compra=${encodeURIComponent(compraId)}${estado ? `&estado=${estado}` : ''}`, publicEnv.NEXT_PUBLIC_APP_URL));
  if (!UUID_RE.test(compraId) || !orden) return listo('error');

  const admin = createAdminClient();
  const { data: compra } = await admin.from('pack_purchases').select('id, provider, provider_ref, status').eq('id', compraId).maybeSingle();
  if (!compra || compra.provider !== 'paypal' || compra.provider_ref !== orden) return listo('error');
  if (compra.status === 'paid') return listo();

  let cap;
  try {
    cap = await paypalCobrar(orden, compraId);
  } catch {
    return listo('error');
  }
  if (!cap?.id || !cap.amount?.value || !cap.amount.currency_code) return listo('error');

  const { error } = await admin.rpc('settle_pack_purchase', {
    p_purchase_id: compraId,
    p_provider: 'paypal',
    p_payment_id: cap.id,
    p_paid_cents: Math.round(parseFloat(cap.amount.value) * 100),
    p_currency: cap.amount.currency_code,
  });
  if (error) return listo('error');
  return listo();
}
