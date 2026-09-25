import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { mpPago } from '@/lib/cobroParygo';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Resultado de una compra de paquete (0070). Acreditan el webhook de MP, la
// vuelta de PayPal y, de respaldo, ESTA página al volver de MP (ver abajo).
// Todos por settle_pack_purchase, idempotente: acreditar dos veces no suma dos.
export default async function CompraListaPage({ searchParams }: { searchParams: { compra?: string; estado?: string; payment_id?: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) redirect('/login');

  const admin = createAdminClient();
  const id = /^[0-9a-f-]{36}$/i.test(searchParams.compra ?? '') ? searchParams.compra! : null;
  // Acotada a la marca de la sesión: no se lee una compra ajena por su id.
  const leer = async () => id
    ? (await admin.from('pack_purchases').select('id, pack, provider, provider_ref, status').eq('id', id).eq('brand_id', ctx.brandId).maybeSingle()).data
    : null;
  let compra = await leer();

  // Respaldo del webhook: MP vuelve con ?payment_id=. NO se cree la URL: el
  // pago se vuelve a pedir a MP con el token de ParyGo, tiene que ser de ESTA
  // compra (external_reference) y estar aprobado, y la RPC contrasta monto y
  // moneda contra lo congelado. Si el webhook ya acreditó, da 'already_paid'.
  const paymentId = searchParams.payment_id ?? '';
  // También desde 'failed': un primer intento rechazado marca la compra así y
  // el reintento aprobado sobre la misma preferencia tiene que poder acreditar.
  if (compra?.provider === 'mercadopago' && compra.status !== 'paid' && /^\d{1,20}$/.test(paymentId)) {
    try {
      const pago = await mpPago(paymentId);
      if (pago.external_reference === compra.id && pago.status === 'approved' && typeof pago.transaction_amount === 'number' && pago.currency_id) {
        await admin.rpc('settle_pack_purchase', {
          p_purchase_id: compra.id,
          p_provider: 'mercadopago',
          p_payment_id: String(pago.id ?? paymentId),
          p_paid_cents: Math.round(pago.transaction_amount * 100),
          p_currency: pago.currency_id,
        });
        compra = await leer();
      }
    } catch {
      // Sin respuesta de MP: queda "confirmando" y el webhook lo resuelve.
    }
  }
  const { data: brand } = await admin.from('brands').select('event_balance').eq('id', ctx.brandId).single();

  let titulo: string;
  let texto: string;
  if (compra?.status === 'paid') {
    titulo = 'Listo, ya tienes tus eventos';
    texto = `Se sumaron ${compra.pack} evento${compra.pack === 1 ? '' : 's'} a tu saldo. Ahora tienes ${brand?.event_balance ?? 0}.`;
  } else if (compra?.status === 'failed') {
    titulo = 'El pago no se completó';
    texto = 'No se sumó nada a tu saldo. Si se te cobró, escríbenos y lo revisamos.';
  } else if (compra) {
    titulo = 'Estamos confirmando tu pago';
    texto = 'Suele tardar unos segundos. Recarga esta página en un momento; si el pago se aprobó, tu saldo se suma solo.';
  } else {
    titulo = 'No encontramos esa compra';
    texto = 'Si pagaste y no ves tu saldo, escríbenos y lo revisamos.';
  }

  // PayPal: si la vuelta falló (red, sesión), reintentar la vuelta es seguro:
  // el cobro es idempotente y un pago ya cobrado no se acredita dos veces.
  const reintentarPaypal = compra && compra.provider === 'paypal' && compra.status === 'pending' && compra.provider_ref
    ? `/api/paypal/volver?compra=${compra.id}&token=${encodeURIComponent(compra.provider_ref)}`
    : null;

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 className="s-h1">{titulo}</h1>
      <p className="s-card__desc" style={{ marginBottom: 'var(--s-s3)' }}>{texto}</p>
      <div className="s-form-actions" style={{ borderTop: 0, paddingTop: 0 }}>
        {compra?.status === 'paid'
          ? <Link href="/admin/events/new" className="s-btn s-btn--primary s-btn--sm">Crear evento</Link>
          : <Link href={`/admin/comprar/listo?compra=${compra?.id ?? ''}`} className="s-btn s-btn--soft s-btn--sm">Recargar</Link>}
        {reintentarPaypal && <a href={reintentarPaypal} className="s-btn s-btn--ghost s-btn--sm">Confirmar con PayPal</a>}
        <Link href="/admin" className="s-btn s-btn--ghost s-btn--sm">Volver al panel</Link>
      </div>
    </div>
  );
}
