import type { SupabaseClient } from '@supabase/supabase-js';

// ¿Hace falta un método de pago para publicar este evento? (Paul, 2026-10-01:
// "algunos eventos tal vez sean gratis y no es necesario el método de pago").
// Un evento COBRA si no está marcado gratis y tiene al menos una entrada activa
// que no es cortesía. En un evento pago un tipo de S/0 nace cortesía por
// trigger (0059), así que "no cortesía" = se vende con precio.
// Falla CERRADO: si no se puede leer, se asume que cobra.
export async function eventoCobra(admin: SupabaseClient, eventId: string, brandId: string): Promise<boolean> {
  const { data: ev, error } = await admin.from('events').select('is_free').eq('id', eventId).eq('brand_id', brandId).maybeSingle();
  if (error) return true;
  if (!ev || ev.is_free) return false;
  const { count, error: e2 } = await admin
    .from('ticket_types')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('is_active', true)
    .eq('is_courtesy', false);
  return e2 ? true : (count ?? 0) > 0;
}

// Métodos con los que hoy una marca COBRA entradas. Hoy: su Yape (Perú). El
// Mercado Pago por marca está diferido y no cuenta hasta "Conectar Mercado Pago".
export async function marcaTieneMetodo(admin: SupabaseClient, brandId: string): Promise<boolean> {
  const { data: b } = await admin.from('brands').select('yape_number').eq('id', brandId).maybeSingle();
  return !!b?.yape_number?.trim();
}

// Después de un cambio en un evento YA PUBLICADO (agregar o reactivar una
// entrada con precio, quitarle "gratis"): si ahora cobra y la marca no tiene
// método, vuelve a borrador. Así ningún comprador deja sus datos en un evento
// que no puede cobrar (security review 2026-10-01). true = se despublicó.
export async function bajarABorradorSiFaltaMetodo(admin: SupabaseClient, eventId: string, brandId: string): Promise<boolean> {
  const { data: ev } = await admin.from('events').select('is_published').eq('id', eventId).eq('brand_id', brandId).maybeSingle();
  if (!ev?.is_published) return false;
  if (!(await eventoCobra(admin, eventId, brandId)) || (await marcaTieneMetodo(admin, brandId))) return false;
  await admin.from('events').update({ is_published: false }).eq('id', eventId).eq('brand_id', brandId);
  await admin.from('events_log').insert({ brand_id: brandId, event_id: eventId, type: 'event_unpublished', payload: { motivo: 'falta_metodo_de_pago' } });
  return true;
}

// ¿La marca tiene algún evento publicado que cobra? (para no dejarla quitar su
// único método de pago con eventos a la venta).
export async function marcaCobraEnVivo(admin: SupabaseClient, brandId: string): Promise<boolean> {
  const { data: evs } = await admin.from('events').select('id').eq('brand_id', brandId).eq('is_published', true).is('archived_at', null);
  for (const e of evs ?? []) if (await eventoCobra(admin, e.id, brandId)) return true;
  return false;
}
