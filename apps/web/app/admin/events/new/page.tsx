import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createClient } from '@/lib/supabase/server';
import { EventWizard } from './EventWizard';
import { pruebaDisponible, PRIVADO_TOPE_ENTRADAS, PRUEBA_TOPE_ENTRADAS } from '@/lib/prueba';
import { textosPanel } from '@/lib/idiomaServer';
import { paletaCompra } from '@/lib/temaCompra.mjs';
import { brandColor, brandFillPair } from '@/lib/brandColors';

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
    .select('id, name, slug, event_balance, tipo, theme_json, tema_compra')
    .eq('id', ctx.brandId)
    .single();
  if (!brand) redirect('/admin');

  // Hard gate (UX): sin saldo ni prueba → no llega al form. El RPC es el guard real.
  const saldo = brand.event_balance ?? 0;
  const prueba = saldo <= 0 && (await pruebaDisponible(ctx.brandId));
  if (saldo <= 0 && !prueba) redirect('/admin');
  const tope = prueba ? PRUEBA_TOPE_ENTRADAS : brand.tipo === 'privado' ? PRIVADO_TOPE_ENTRADAS : null;

  // La vista previa usa los MISMOS colores que la página de compra de la
  // marca (b/[brand]/layout.tsx): su tema y su botón medido.
  const primary = ((brand.theme_json ?? {}) as { primary_color?: string }).primary_color;
  const pal = paletaCompra(brand.tema_compra, primary);
  const par = brandFillPair(primary, 'neutra');
  const vista: Record<string, string> = {
    ...pal.vars,
    '--brand': brandColor(primary),
    '--brand-fill': pal.boton ? pal.boton.fill : par.fill,
    '--on-fill': pal.boton ? pal.boton.onFill : par.on,
  };

  return (
    <EventWizard marcaSlug={brand.slug} marcaNombre={brand.name} saldo={saldo} prueba={prueba} tope={tope} vista={vista}>
      <Link href="/admin" className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> {t('Tus eventos', 'Your events')}
      </Link>
      <h1 className="s-h1 cw-h1">{t('Crear evento', 'Create event')}</h1>
      <p className="s-card__desc">
        {prueba
          ? t(`Una pregunta a la vez. Es tu evento de prueba gratis: hasta ${PRUEBA_TOPE_ENTRADAS} entradas en total.`, `One question at a time. This is your free trial event: up to ${PRUEBA_TOPE_ENTRADAS} tickets in total.`)
          : brand.tipo === 'privado'
          ? t(`Una pregunta a la vez. Es un evento privado: hasta ${PRIVADO_TOPE_ENTRADAS} entradas en total.`, `One question at a time. It's a private event: up to ${PRIVADO_TOPE_ENTRADAS} tickets in total.`)
          : t('Una pregunta a la vez. Lo que no tengas ahora lo completas después.', "One question at a time. Anything you don't have now, you can fill in later.")}
      </p>
    </EventWizard>
  );
}
