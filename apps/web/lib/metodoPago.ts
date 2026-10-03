import { paypalSirve } from '@/lib/paypalMarca';
import type { SupabaseClient } from '@supabase/supabase-js';
import { monedaDe, type Moneda } from '@/lib/moneda';
import { zonaDe, type Zona } from '@/lib/zona';
import { medioDe, medioSirve } from '@/lib/metodoManual';

// Moneda de las entradas de la marca, releída en el server (nunca del form).
// Falla CERRADO: si no se puede leer, tira. Caer en PEN leería "50.000" de una
// marca en COP como 50 soles.
export async function monedaDeMarca(admin: SupabaseClient, brandId: string): Promise<Moneda> {
  const { data, error } = await admin.from('brands').select('moneda').eq('id', brandId).maybeSingle();
  if (error || !data) throw new Error('No se pudo leer la moneda de la marca');
  return monedaDe(data.moneda);
}

// Zona horaria de la marca, releída en el server (nunca del form). Falla CERRADO:
// caer en Lima correría el evento de una marca de Madrid.
export async function zonaDeMarca(admin: SupabaseClient, brandId: string): Promise<Zona> {
  const { data, error } = await admin.from('brands').select('zona_horaria').eq('id', brandId).maybeSingle();
  if (error || !data) throw new Error('No se pudo leer la zona horaria de la marca');
  return zonaDe(data.zona_horaria);
}

// ¿Hace falta un método de pago para publicar este evento? (Paul, 2026-10-01:
// "algunos eventos tal vez sean gratis y no es necesario el método de pago").
// Un evento COBRA si no está marcado gratis y tiene al menos una entrada activa
// que no es cortesía y tiene precio > 0 (un S/0 que quedó de cuando el evento
// era gratis no se vende en un evento pago: publicTicketGuard lo oculta;
// Codex P2 2026-10-01).
// Falla CERRADO: si no se puede leer, se asume que cobra.
export async function eventoCobra(admin: SupabaseClient, eventId: string, brandId: string): Promise<boolean> {
  // Las dos consultas en paralelo (una sola espera desde Lima).
  const [{ data: ev, error }, { count, error: e2 }] = await Promise.all([
    admin.from('events').select('is_free').eq('id', eventId).eq('brand_id', brandId).maybeSingle(),
    admin.from('ticket_types').select('id', { count: 'exact', head: true })
      .eq('event_id', eventId).eq('is_active', true).eq('is_courtesy', false).gt('price_cents', 0),
  ]);
  if (error || e2) return true;
  if (!ev || ev.is_free) return false;
  return (count ?? 0) > 0;
}

// Métodos con los que una marca COBRA entradas: su medio manual (cuenta cargada
// y compatible con la moneda), su Mercado Pago conectado (0086, solo en PEN) o
// su PayPal conectado (0091, solo en USD/EUR/MXN).
// `sinYape` / `sinPaypal`: "¿le queda algún método si quita ese?".
export async function marcaTieneMetodo(admin: SupabaseClient, brandId: string, o: { sinYape?: boolean; sinPaypal?: boolean } = {}): Promise<boolean> {
  const { data: b } = await admin.from('brands').select('yape_number, mp_oauth_user_id, paypal_client_id, moneda, metodo_manual').eq('id', brandId).maybeSingle();
  const moneda = monedaDe(b?.moneda);
  const manual = !o.sinYape && !!b?.yape_number?.trim() && medioSirve(medioDe(b?.metodo_manual), moneda);
  const paypal = !o.sinPaypal && !!b?.paypal_client_id && paypalSirve(moneda);
  return manual || paypal || (!!b?.mp_oauth_user_id && moneda === 'PEN');
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
