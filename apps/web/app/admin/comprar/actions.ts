'use server';

import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { contextoEscritura } from '@/lib/impersonation';
import { packDe, type Pasarela } from '@/lib/packs';
import { mpListo, paypalListo } from '@/lib/cobroParygo';
import { iniciarCompraPack } from '@/lib/compraPack';

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

  const r = await iniciarCompraPack({ brandId: ctx.brandId, userId: user.id, email: user.email ?? null, pack, pasarela });
  if (!r.ok) return { ok: false, message: r.message };
  redirect(r.destino);
}
