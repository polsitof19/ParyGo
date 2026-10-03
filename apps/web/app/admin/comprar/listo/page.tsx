import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { acreditarVueltaMp } from '@/lib/compraPack';
import { textosPanel } from '@/lib/idiomaServer';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
// Sin esto Next cacheaba la lectura de la compra: pagada en la base y la
// página seguía diciendo 'confirmando' (medido en el E2E del alta, 2026-09-25).
export const fetchCache = 'force-no-store';

// Resultado de una compra de paquete (0070). Acreditan el webhook de MP, la
// vuelta de PayPal y, de respaldo, ESTA página al volver de MP (ver abajo).
// Todos por settle_pack_purchase, idempotente: acreditar dos veces no suma dos.
export default async function CompraListaPage({ searchParams }: { searchParams: { compra?: string; estado?: string; payment_id?: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) redirect('/login');
  const { t } = await textosPanel();

  const admin = createAdminClient();
  const id = /^[0-9a-f-]{36}$/i.test(searchParams.compra ?? '') ? searchParams.compra! : null;
  // Acotada a la marca de la sesión: no se lee una compra ajena por su id.
  const leer = async () => id
    ? (await admin.from('pack_purchases').select('id, pack, provider, provider_ref, status').eq('id', id).eq('brand_id', ctx.brandId).maybeSingle()).data
    : null;
  let compra = await leer();

  // Respaldo del webhook al volver de MP (ver lib/compraPack.ts).
  if (compra) {
    await acreditarVueltaMp(compra, searchParams.payment_id ?? '');
    compra = await leer();
  }
  const { data: brand } = await admin.from('brands').select('event_balance').eq('id', ctx.brandId).single();

  let titulo: string;
  let texto: string;
  if (compra?.status === 'paid') {
    titulo = t('Listo, ya tienes tus eventos', 'Done, you now have your events');
    texto = t(`Se sumaron ${compra.pack} evento${compra.pack === 1 ? '' : 's'} a tu saldo. Ahora tienes ${brand?.event_balance ?? 0}.`, `${compra.pack} event${compra.pack === 1 ? '' : 's'} were added to your balance. You now have ${brand?.event_balance ?? 0}.`);
  } else if (compra?.status === 'failed') {
    titulo = t('El pago no se completó', 'The payment was not completed');
    texto = t('No se sumó nada a tu saldo. Si se te cobró, escríbenos y lo revisamos.', 'Nothing was added to your balance. If you were charged, contact us and we will check it.');
  } else if (compra) {
    titulo = t('Estamos confirmando tu pago', 'We are confirming your payment');
    texto = t('Suele tardar unos segundos. Recarga esta página en un momento; si el pago se aprobó, tu saldo se suma solo.', 'It usually takes a few seconds. Reload this page in a moment; if the payment was approved, your balance updates on its own.');
  } else {
    titulo = t('No encontramos esa compra', 'We could not find that purchase');
    texto = t('Si pagaste y no ves tu saldo, escríbenos y lo revisamos.', "If you paid and don't see your balance, contact us and we will check it.");
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
          ? <Link href="/admin/events/new" className="s-btn s-btn--primary s-btn--sm">{t('Crear evento', 'Create event')}</Link>
          : <Link href={`/admin/comprar/listo?compra=${compra?.id ?? ''}`} className="s-btn s-btn--soft s-btn--sm">{t('Recargar', 'Reload')}</Link>}
        {reintentarPaypal && <a href={reintentarPaypal} className="s-btn s-btn--ghost s-btn--sm">{t('Confirmar con PayPal', 'Confirm with PayPal')}</a>}
        <Link href="/admin" className="s-btn s-btn--ghost s-btn--sm">{t('Volver al panel', 'Back to dashboard')}</Link>
      </div>
    </div>
  );
}
