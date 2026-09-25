import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';
import { precioDe, type Pack, type Pasarela } from '@/lib/packs';
import { mpCrearPreferencia, paypalCrearOrden } from '@/lib/cobroParygo';

// Crea la compra de un paquete (0070) y devuelve a dónde mandar al organizador
// para pagar. La usan /admin/comprar y el alta de /empezar. El monto sale de
// lib/packs.ts y queda CONGELADO en pack_purchases ANTES de ir a la pasarela;
// quien llama ya validó sesión, marca y que la pasarela esté configurada.
export async function iniciarCompraPack(a: {
  brandId: string;
  userId: string;
  email: string | null;
  pack: Pack;
  pasarela: Pasarela;
}): Promise<{ ok: true; destino: string } | { ok: false; message: string }> {
  const { currency, cents } = precioDe(a.pack, a.pasarela);
  const admin = createAdminClient();
  const { data: compra, error } = await admin
    .from('pack_purchases')
    .insert({ brand_id: a.brandId, pack: a.pack.eventos, provider: a.pasarela, currency, amount_cents: cents, created_by: a.userId })
    .select('id')
    .single();
  if (error || !compra) return { ok: false, message: 'No se pudo iniciar la compra. Intenta de nuevo.' };

  const app = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const titulo = `ParyGo · ${a.pack.eventos} evento${a.pack.eventos === 1 ? '' : 's'}`;
  try {
    if (a.pasarela === 'mercadopago') {
      const pref = await mpCrearPreferencia({
        compraId: compra.id, titulo, soles: cents / 100, email: a.email,
        exito: `${app}/admin/comprar/listo?compra=${compra.id}`,
        fallo: `${app}/admin/comprar?cancelado=1`,
      });
      await admin.from('pack_purchases').update({ provider_ref: pref.id }).eq('id', compra.id);
      return { ok: true, destino: pref.initPoint };
    }
    const orden = await paypalCrearOrden({
      compraId: compra.id, titulo, usd: (cents / 100).toFixed(2),
      volver: `${app}/api/paypal/volver?compra=${compra.id}`,
      cancelar: `${app}/admin/comprar?cancelado=1`,
    });
    // provider_ref es lo que autoriza la vuelta: sin guardarlo, no se sigue.
    const { error: e2 } = await admin.from('pack_purchases').update({ provider_ref: orden.id }).eq('id', compra.id);
    if (e2) throw e2;
    return { ok: true, destino: orden.aprobar };
  } catch {
    await admin.from('pack_purchases').update({ status: 'failed' }).eq('id', compra.id).eq('status', 'pending');
    return { ok: false, message: 'La pasarela no respondió. No se te cobró nada; intenta de nuevo en un rato.' };
  }
}
