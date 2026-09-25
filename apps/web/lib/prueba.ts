import { createAdminClient } from '@/lib/supabase/admin';
import { textos, type Idioma } from '@/lib/idioma';

// Prueba gratis (0069; tope 20 desde 0071): 1 evento sin saldo, hasta 20 entradas.
// Tiene que coincidir con prueba_tope_entradas() en la base.
export const PRUEBA_TOPE_ENTRADAS = 20;

// Se lee con service role ACOTADO a la marca de la sesión: las columnas de
// brands se exponen a `authenticated` una por una (0023/0043/0052) y esta no
// tiene grant; con la sesión del organizador daría "permission denied" y la
// página entera caería (lo que pasó con yape_qr_url).
export async function pruebaDisponible(brandId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('brands').select('prueba_disponible').eq('id', brandId).maybeSingle();
  return data?.prueba_disponible === true;
}

// Los errores del tope (trigger de ticket_types / create_brand_trial_event)
// en palabras del organizador. null si el error no es del tope.
export function mensajePrueba(msg: string | undefined | null, l: Idioma = 'es'): string | null {
  const { t } = textos(l);
  if (!msg) return null;
  if (msg.includes('PRUEBA_TOPE_ENTRADAS')) return t(`Tu evento de prueba admite hasta ${PRUEBA_TOPE_ENTRADAS} entradas en total, sumando todos los tipos (también las gratis y cortesías).`, `Your trial event allows up to ${PRUEBA_TOPE_ENTRADAS} tickets in total, across all types (including free and complimentary ones).`);
  if (msg.includes('PRUEBA_SIN_ILIMITADO')) return t(`En el evento de prueba no hay entradas sin límite: el total es de hasta ${PRUEBA_TOPE_ENTRADAS}.`, `Trial events cannot have unlimited tickets: the total is up to ${PRUEBA_TOPE_ENTRADAS}.`);
  return null;
}
