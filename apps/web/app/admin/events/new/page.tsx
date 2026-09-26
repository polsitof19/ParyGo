import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createClient } from '@/lib/supabase/server';
import { EventBuilder } from './EventBuilder';
import { pruebaDisponible, PRUEBA_TOPE_ENTRADAS } from '@/lib/prueba';
import { textosPanel } from '@/lib/idiomaServer';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function NewBrandEventPage() {
  const user = await requireSession();
  const { t } = await textosPanel();
  const ctx = ownerBrandContext(user);
  if (!ctx) redirect('/login');
  // Crear evento es escritura: en solo lectura (super admin viendo la marca) no
  // se entra al form. El RPC es el guard real; esto es UX.
  // Con el modo edición encendido el super admin puede crear un evento para
  // la marca; consume el saldo de ELLA, igual que si lo creara el promotor.
  if (ctx.soloLectura) redirect('/admin');

  const supabase = createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, event_balance')
    .eq('id', ctx.brandId)
    .single();
  if (!brand) redirect('/admin');

  // Hard gate (UX): sin saldo ni prueba → no llega al form. El RPC es el guard real.
  const conSaldo = (brand.event_balance ?? 0) > 0;
  const prueba = !conSaldo && (await pruebaDisponible(ctx.brandId));
  if (!conSaldo && !prueba) redirect('/admin');

  return (
    <div style={{ maxWidth: 680 }}>
      <Link href="/admin" className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> {t('Tus eventos', 'Your events')}
      </Link>
      <header style={{ marginBottom: 22 }}>
        <h1 className="s-h1" style={{ marginTop: 8 }}>{t('Crear evento', 'Create event')}</h1>
        <p className="s-card__desc">
          {prueba
            ? t(
                `Tres pasos: lo básico, las entradas y (si quieres) los detalles. Es tu evento de prueba gratis: hasta ${PRUEBA_TOPE_ENTRADAS} entradas en total, sumando todos los tipos. Se crea en borrador y lo publicas cuando esté listo.`,
                `Three steps: the basics, tickets and (if you want) the details. This is your free trial event: up to ${PRUEBA_TOPE_ENTRADAS} tickets in total, across all types combined. It's created as a draft and you publish it when ready.`
              )
            : t(
                `Tres pasos: lo básico, las entradas y (si quieres) los detalles. Usa 1 de tu saldo (${brand.event_balance} disponible${brand.event_balance === 1 ? '' : 's'}). Se crea en borrador y lo publicas cuando esté listo.`,
                `Three steps: the basics, tickets and (if you want) the details. Uses 1 from your balance (${brand.event_balance} available). It's created as a draft and you publish it when ready.`
              )}
        </p>
      </header>
      <EventBuilder />
    </div>
  );
}
