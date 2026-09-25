import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';
import { paypalCobrar } from '@/lib/cobroParygo';
import { sendAltaPendiente } from '@/lib/email/sendAltaEmails';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// Vuelta de PayPal tras aprobar el pago de un paquete (0070).
// =============================================================
// PayPal redirige acá con ?token=<orden>. Con intent CAPTURE la plata recién
// se mueve cuando ESTE server cobra la orden: si el comprador no vuelve, no
// se le cobra nada. No exige sesión (puede haber vencido mientras pagaba, y en
// el alta de /empezar todavía no hay cuenta): lo que autoriza es que la orden
// sea la que el server creó para ESTA compra (provider_ref) y que PayPal
// confirme la captura COMPLETED; el monto y la moneda los contrasta
// settle_pack_purchase contra lo congelado.
//
// A dónde vuelve: una compra del panel (created_by con usuario) a
// /admin/comprar/listo; una del alta de /empezar (created_by null) a
// /empezar/listo, que crea la cuenta con el pago ya cobrado.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const compraId = url.searchParams.get('compra') ?? '';
  const orden = url.searchParams.get('token') ?? '';
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';

  const admin = createAdminClient();
  const { data: compra } = UUID_RE.test(compraId)
    ? await admin.from('pack_purchases').select('id, provider, provider_ref, status, created_by').eq('id', compraId).maybeSingle()
    : { data: null };
  const deAlta = compra?.created_by === null;
  const listo = (estado?: string) => {
    const destino = deAlta
      ? `/empezar/listo?compra=${encodeURIComponent(compraId)}&lang=${lang}`
      : `/admin/comprar/listo?compra=${encodeURIComponent(compraId)}${estado ? `&estado=${estado}` : ''}`;
    return NextResponse.redirect(new URL(destino, publicEnv.NEXT_PUBLIC_APP_URL));
  };
  if (!compra || !orden || compra.provider !== 'paypal' || compra.provider_ref !== orden) return listo('error');
  if (compra.status === 'paid') return listo();

  let res;
  try {
    res = await paypalCobrar(orden, compraId);
  } catch {
    return listo('error');
  }
  // PayPal dijo que no (tarjeta rechazada, orden no aprobada): la compra pasa
  // a fallida y "listo" ofrece volver a intentar. Antes quedaba "confirmando"
  // para siempre (security review 2026-09-25).
  if (res.rechazado) {
    await admin.from('pack_purchases').update({ status: 'failed' }).eq('id', compraId).eq('status', 'pending');
    return listo('error');
  }
  const cap = res.captura;
  if (!cap?.id || !cap.amount?.value || !cap.amount.currency_code) return listo('error');

  const { data: s, error } = await admin.rpc('settle_pack_purchase', {
    p_purchase_id: compraId,
    p_provider: 'paypal',
    p_payment_id: cap.id,
    p_paid_cents: Math.round(parseFloat(cap.amount.value) * 100),
    p_currency: cap.amount.currency_code,
  });
  if (error) return listo('error');

  // Alta de /empezar ya cobrada: por si cierra la pestaña antes de que cargue
  // "listo", le llega el link para terminar (con MP lo manda el webhook).
  const r = s as { action?: string; brand_id?: string } | null;
  if (deAlta && r?.action === 'credited' && r.brand_id) {
    const { data: b } = await admin.from('brands').select('name, contact_email').eq('id', r.brand_id).single();
    if (b?.contact_email) await sendAltaPendiente({ to: b.contact_email, marca: b.name, compraId, lang });
  }
  return listo();
}
