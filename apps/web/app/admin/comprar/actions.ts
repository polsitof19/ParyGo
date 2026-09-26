'use server';

import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { contextoEscritura } from '@/lib/impersonation';
import { packDe, type Pasarela } from '@/lib/packs';
import { mpListo, paypalListo } from '@/lib/cobroParygo';
import { iniciarCompraPack } from '@/lib/compraPack';
import { textosPanel, idiomaPanel } from '@/lib/idiomaServer';

export type CompraState = { ok: boolean; message: string | null };

// Compra de un paquete de eventos (0070). La marca sale de la SESIÓN; el
// navegador solo elige paquete y pasarela. El monto sale de lib/packs.ts y
// queda congelado en pack_purchases ANTES de ir a la pasarela.
export async function comprarPackAction(_prev: CompraState, formData: FormData): Promise<CompraState> {
  const user = await requireSession();
  const { t } = await textosPanel();
  const ctx = contextoEscritura(user);
  if (!ctx) return { ok: false, message: t('No tienes permiso para comprar para esta marca.', "You don't have permission to buy for this brand.") };

  const pack = packDe(Number(formData.get('pack')));
  const pasarela = formData.get('pasarela') as Pasarela;
  if (!pack || (pasarela !== 'mercadopago' && pasarela !== 'paypal')) return { ok: false, message: t('Elige un paquete.', 'Choose a pack.') };
  if (pasarela === 'mercadopago' ? !mpListo() : !paypalListo()) {
    return { ok: false, message: t('Ese medio de pago todavía no está disponible. Prueba con el otro o escríbenos.', 'That payment method is not available yet. Try the other one or contact us.') };
  }

  const r = await iniciarCompraPack({ brandId: ctx.brandId, userId: user.id, email: user.email ?? null, pack, pasarela, l: await idiomaPanel() });
  if (!r.ok) return { ok: false, message: r.message };
  redirect(r.destino);
}
