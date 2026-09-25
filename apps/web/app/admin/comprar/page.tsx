import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { mpListo, paypalListo } from '@/lib/cobroParygo';
import { ComprarPacks } from './ComprarPacks';
import { textosPanel } from '@/lib/idiomaServer';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Comprar paquetes de eventos (0070): paga y el saldo se suma solo.
export default async function ComprarPage({ searchParams }: { searchParams: { cancelado?: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) redirect('/login');
  if (ctx.soloLectura) redirect('/admin');
  const { t } = await textosPanel();

  const { data: brand } = await createAdminClient().from('brands').select('event_balance').eq('id', ctx.brandId).single();

  return (
    <div style={{ maxWidth: 680 }}>
      <Link href="/admin" className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> {t('Tus eventos', 'Your events')}
      </Link>
      <h1 className="s-h1" style={{ marginTop: 8 }}>{t('Comprar eventos', 'Buy events')}</h1>
      <p className="s-card__desc" style={{ marginBottom: 'var(--s-s3)' }}>
        {t(`Tienes ${brand?.event_balance ?? 0} evento${brand?.event_balance === 1 ? '' : 's'} de saldo. Cada evento es uno que creas, con entradas sin límite. Pagas y el saldo se suma al toque. En Perú, con MercadoPago (tarjeta o Yape); desde afuera, con PayPal en dólares.`, `You have ${brand?.event_balance ?? 0} event${brand?.event_balance === 1 ? '' : 's'} in your balance. Each event is one you create, with unlimited tickets. Pay and your balance updates instantly. In Peru, with MercadoPago (card or Yape); from abroad, with PayPal in dollars.`)}
      </p>
      {searchParams.cancelado && <p className="s-notice" role="status">{t('No se completó el pago. No se te cobró nada.', 'The payment was not completed. You were not charged.')}</p>}
      <ComprarPacks mp={mpListo()} paypal={paypalListo()} />
    </div>
  );
}
