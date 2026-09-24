import { createAdminClient } from '@/lib/supabase/admin';

// Prueba gratis (0069): 1 evento sin saldo, hasta 50 entradas en total.
export const PRUEBA_TOPE_ENTRADAS = 50;

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
export function mensajePrueba(msg: string | undefined | null): string | null {
  if (!msg) return null;
  if (msg.includes('PRUEBA_TOPE_ENTRADAS')) return `Tu evento de prueba admite hasta ${PRUEBA_TOPE_ENTRADAS} entradas en total, sumando todos los tipos (también las gratis y cortesías).`;
  if (msg.includes('PRUEBA_SIN_ILIMITADO')) return `En el evento de prueba no hay entradas sin límite: el total es de hasta ${PRUEBA_TOPE_ENTRADAS}.`;
  return null;
}
