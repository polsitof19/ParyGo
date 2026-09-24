'use server';

import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { contextoEscritura } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';
import { packDe, precioDe, type Pasarela } from '@/lib/packs';
import { mpListo, paypalListo, mpCrearPreferencia, paypalCrearOrden } from '@/lib/cobroParygo';

export type CompraState = { ok: boolean; message: string | null };

// Compra de un paquete de eventos (0070). La marca sale de la SESIÓN; el
// navegador solo elige paquete y pasarela. El monto sale de lib/packs.ts y
// queda congelado en pack_purchases ANTES de ir a la pasarela.
export async function comprarPackAction(_prev: CompraState, formData: FormData): Promise<CompraState> {
  const user = await requireSession();
  const ctx = contextoEscritura(user);
  if (!ctx) return { ok: false, message: 'No tienes permiso para comprar para esta marca.' };

  const pack = packDe(Number(formData.get('pack')));
  const pasarela = formData.get('pasarela') as Pasarela;
  if (!pack || (pasarela !== 'mercadopago' && pasarela !== 'paypal')) return { ok: false, message: 'Elige un paquete.' };
  if (pasarela === 'mercadopago' ? !mpListo() : !paypalListo()) {
    return { ok: false, message: 'Ese medio de pago todavía no está disponible. Prueba con el otro o escríbenos.' };
  }

  const { currency, cents } = precioDe(pack, pasarela);
  const admin = createAdminClient();
  const { data: compra, error } = await admin
    .from('pack_purchases')
    .insert({ brand_id: ctx.brandId, pack: pack.eventos, provider: pasarela, currency, amount_cents: cents, created_by: user.id })
    .select('id')
    .single();
  if (error || !compra) return { ok: false, message: 'No se pudo iniciar la compra. Intenta de nuevo.' };

  const app = publicEnv.NEXT_PUBLIC_APP_URL;
  const titulo = `ParyGo · ${pack.eventos} evento${pack.eventos === 1 ? '' : 's'}`;
  let destino: string;
  try {
    if (pasarela === 'mercadopago') {
      const pref = await mpCrearPreferencia({
        compraId: compra.id, titulo, soles: cents / 100, email: user.email ?? null,
        exito: `${app}/admin/comprar/listo?compra=${compra.id}`,
        fallo: `${app}/admin/comprar?cancelado=1`,
        notificacion: `${app}/api/webhooks/parygo-mp`,
      });
      await admin.from('pack_purchases').update({ provider_ref: pref.id }).eq('id', compra.id);
      destino = pref.initPoint;
    } else {
      const orden = await paypalCrearOrden({
        compraId: compra.id, titulo, usd: (cents / 100).toFixed(2),
        volver: `${app}/api/paypal/volver?compra=${compra.id}`,
        cancelar: `${app}/admin/comprar?cancelado=1`,
      });
      // provider_ref es lo que autoriza la vuelta: sin guardarlo, no se sigue.
      const { error: e2 } = await admin.from('pack_purchases').update({ provider_ref: orden.id }).eq('id', compra.id);
      if (e2) throw e2;
      destino = orden.aprobar;
    }
  } catch {
    await admin.from('pack_purchases').update({ status: 'failed' }).eq('id', compra.id).eq('status', 'pending');
    return { ok: false, message: 'La pasarela no respondió. No se te cobró nada; intenta de nuevo en un rato.' };
  }
  redirect(destino);
}
