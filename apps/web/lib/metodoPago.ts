import type { SupabaseClient } from '@supabase/supabase-js';

// ¿Hace falta un método de pago para publicar este evento? (Paul, 2026-10-01:
// "algunos eventos tal vez sean gratis y no es necesario el método de pago").
// Un evento COBRA si no está marcado gratis y tiene al menos una entrada activa
// que no es cortesía. En un evento pago un tipo de S/0 nace cortesía por
// trigger (0059), así que "no cortesía" = se vende con precio.
export async function eventoCobra(admin: SupabaseClient, eventId: string, brandId: string): Promise<boolean> {
  const { data: ev } = await admin.from('events').select('is_free').eq('id', eventId).eq('brand_id', brandId).maybeSingle();
  if (!ev || ev.is_free) return false;
  const { count } = await admin
    .from('ticket_types')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('is_active', true)
    .eq('is_courtesy', false);
  return (count ?? 0) > 0;
}

// Métodos con los que hoy una marca COBRA entradas. Hoy: su Yape (Perú). El
// Mercado Pago por marca está diferido y no cuenta hasta "Conectar Mercado Pago".
export async function marcaTieneMetodo(admin: SupabaseClient, brandId: string): Promise<boolean> {
  const { data: b } = await admin.from('brands').select('yape_number').eq('id', brandId).maybeSingle();
  return !!b?.yape_number?.trim();
}
