import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';
import { precioDe, type Pack, type Pasarela } from '@/lib/packs';
import { mpCrearPreferencia, mpPago, paypalCrearOrden } from '@/lib/cobroParygo';

// Crea la compra de un paquete (0070) y devuelve a dónde mandar al organizador
// para pagar. La usan /admin/comprar y el alta de /empezar. El monto sale de
// lib/packs.ts y queda CONGELADO en pack_purchases ANTES de ir a la pasarela;
// quien llama ya validó sesión (o el alta), marca y que la pasarela esté lista.
// volver/cancelar: a dónde regresa la pasarela. Por defecto, el panel; el alta
// de /empezar vuelve a /empezar/listo, porque ahí todavía no hay sesión.
export async function iniciarCompraPack(a: {
  brandId: string;
  userId: string | null;
  email: string | null;
  pack: Pack;
  pasarela: Pasarela;
  volver?: (compraId: string) => string;
  // Se agrega a la vuelta de PayPal (/api/paypal/volver), p. ej. "&lang=en".
  sufijoPaypal?: string;
  cancelar?: string;
}): Promise<{ ok: true; destino: string; compraId: string } | { ok: false; message: string }> {
  const { currency, cents } = precioDe(a.pack, a.pasarela);
  const admin = createAdminClient();
  const { data: compra, error } = await admin
    .from('pack_purchases')
    .insert({ brand_id: a.brandId, pack: a.pack.eventos, provider: a.pasarela, currency, amount_cents: cents, created_by: a.userId })
    .select('id')
    .single();
  if (error || !compra) return { ok: false, message: 'No se pudo iniciar la compra. Intenta de nuevo.' };

  const app = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const exito = a.volver ? a.volver(compra.id) : `${app}/admin/comprar/listo?compra=${compra.id}`;
  const fallo = a.cancelar ?? `${app}/admin/comprar?cancelado=1`;
  const titulo = `ParyGo · ${a.pack.eventos} evento${a.pack.eventos === 1 ? '' : 's'}`;
  try {
    if (a.pasarela === 'mercadopago') {
      const pref = await mpCrearPreferencia({ compraId: compra.id, titulo, soles: cents / 100, email: a.email, exito, fallo });
      await admin.from('pack_purchases').update({ provider_ref: pref.id }).eq('id', compra.id);
      return { ok: true, destino: pref.initPoint, compraId: compra.id };
    }
    const orden = await paypalCrearOrden({
      compraId: compra.id, titulo, usd: (cents / 100).toFixed(2),
      volver: `${app}/api/paypal/volver?compra=${compra.id}${a.sufijoPaypal ?? ''}`,
      cancelar: fallo,
    });
    // provider_ref es lo que autoriza la vuelta: sin guardarlo, no se sigue.
    const { error: e2 } = await admin.from('pack_purchases').update({ provider_ref: orden.id }).eq('id', compra.id);
    if (e2) throw e2;
    return { ok: true, destino: orden.aprobar, compraId: compra.id };
  } catch (e) {
    // Sin token ni datos de la tarjeta: solo el motivo de la pasarela.
    console.error('[compraPack] la pasarela rechazó la compra', compra.id, e instanceof Error ? e.message : JSON.stringify(e).slice(0, 300));
    await admin.from('pack_purchases').update({ status: 'failed' }).eq('id', compra.id).eq('status', 'pending');
    return { ok: false, message: 'La pasarela no respondió. No se te cobró nada; intenta de nuevo en un rato.' };
  }
}

// Respaldo del webhook al volver de MP con ?payment_id=. NO se cree la URL: el
// pago se vuelve a pedir a MP con el token de ParyGo, tiene que ser de ESTA
// compra (external_reference) y estar aprobado, y settle_pack_purchase
// contrasta monto y moneda contra lo congelado (idempotente: si el webhook ya
// acreditó, da 'already_paid'). También desde 'failed': un intento rechazado
// seguido de uno aprobado sobre la misma preferencia tiene que acreditar.
export async function acreditarVueltaMp(compra: { id: string; provider: string; status: string }, paymentId: string): Promise<void> {
  if (compra.provider !== 'mercadopago' || compra.status === 'paid' || !/^\d{1,20}$/.test(paymentId)) return;
  try {
    const pago = await mpPago(paymentId);
    if (pago.external_reference !== compra.id || pago.status !== 'approved' || typeof pago.transaction_amount !== 'number' || !pago.currency_id) return;
    await createAdminClient().rpc('settle_pack_purchase', {
      p_purchase_id: compra.id,
      p_provider: 'mercadopago',
      p_payment_id: String(pago.id ?? paymentId),
      p_paid_cents: Math.round(pago.transaction_amount * 100),
      p_currency: pago.currency_id,
    });
  } catch {
    // Sin respuesta de MP: queda "confirmando" y el webhook lo resuelve.
  }
}
