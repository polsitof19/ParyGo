import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionUser } from '@/lib/auth';
import { impersonatedBrandId } from '@/lib/impersonation';
import { refrescarToken } from '@/lib/mpOauth';
import { publicEnv } from '@/lib/env';

// =============================================================
// Conexión de Mercado Pago de una marca (OAuth, 0086; plan en AGENTS.md).
// =============================================================

const env = (k: string) => process.env[k]?.trim() || null;

// Credenciales de la app de ParyGo en Mercado Pago (la misma de los packs).
export const mpOauthListo = () => Boolean(env('PARYGO_MP_CLIENT_ID') && env('PARYGO_MP_CLIENT_SECRET'));
export const mpClient = () => ({ clientId: env('PARYGO_MP_CLIENT_ID') ?? '', clientSecret: env('PARYGO_MP_CLIENT_SECRET') ?? '' });
export const redirectUriMp = () => `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/admin/settings/mercadopago/vuelta`;
export const COOKIE_MP_OAUTH = 'parygo_mp_oauth';

// Conectar o desconectar la cuenta donde cae la plata lo hace SOLO la dueña
// real de la marca: no el staff, y no el super admin metido en una marca (ni
// con modo edición: el consentimiento es de la dueña). Revisión de Codex.
export function duenaRealDe(user: SessionUser): string | null {
  if (user.isSuperAdmin && impersonatedBrandId()) return null;
  return user.brandMemberships.find((m) => m.role === 'brand_admin')?.brandId ?? null;
}

// ¿Hay un comprador pagando con tarjeta AHORA? (orden MP con preferencia, sin
// pago registrado, de los últimos 30 min: lo que dura un checkout activo y el
// hold del promo). Mientras haya, no se desconecta ni se cambia de cuenta: el
// pago se valida contra la cuenta conectada (collector_id). Con 48 h un
// checkout abandonado dejaba a la marca sin poder desconectar dos días (Codex);
// un pago más tardío queda en la bitácora como mp_collector_mismatch.
export async function pagosMpEnCurso(admin: SupabaseClient, brandId: string): Promise<boolean> {
  const { count, error } = await admin.from('orders').select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId).eq('payment_method', 'mercadopago').eq('status', 'pending_payment')
    .not('mp_preference_id', 'is', null).is('mp_payment_id', null)
    .gt('created_at', new Date(Date.now() - 30 * 60_000).toISOString());
  return error ? true : (count ?? 0) > 0; // falla cerrado
}

export type EstadoMp = { conectada: boolean; cuenta: string | null; desde: string | null };

export async function estadoMp(admin: SupabaseClient, brandId: string): Promise<EstadoMp> {
  const { data } = await admin.from('brands').select('mp_oauth_user_id, mp_conectado_at').eq('id', brandId).maybeSingle();
  return { conectada: !!data?.mp_oauth_user_id, cuenta: data?.mp_oauth_user_id ?? null, desde: data?.mp_conectado_at ?? null };
}

const SIETE_DIAS = 7 * 864e5;

// ¿Se puede ofrecer "Tarjeta" AHORA? Si el token vence en menos de 7 días (o ya
// venció) se renueva antes de mostrarlo; si no se puede, no se ofrece (falla
// cerrado: antes el comprador dejaba sus datos y recién ahí fallaba; Codex P2).
export async function mpUsable(admin: SupabaseClient, brandId: string, key: string): Promise<boolean> {
  const { data } = await admin.from('brands').select('mp_oauth_user_id, mp_oauth_expires_at').eq('id', brandId).maybeSingle();
  if (!data?.mp_oauth_user_id || !data.mp_oauth_expires_at) return false;
  if (new Date(data.mp_oauth_expires_at).getTime() - Date.now() > SIETE_DIAS) return true;
  try {
    await tokenVigenteMp(admin, brandId, key);
    return true;
  } catch {
    return false;
  }
}

// Token vigente de la marca para cobrar o re-pedir un pago. Refresca 7 días
// antes del vencimiento (el token actual sigue valiendo mientras tanto):
//  - un solo refresco a la vez (tomar_candado); el que pierde usa el vigente;
//  - 'revocado' (MP rechazó el refresh) → se desconecta y se anota;
//  - 'transitorio' (red, 429, 5xx) → no se toca nada, se reintenta después;
//  - token YA vencido sin poder refrescar → error (falla cerrado).
export async function tokenVigenteMp(admin: SupabaseClient, brandId: string, key: string): Promise<string> {
  const { data, error } = await admin.rpc('get_brand_mp_oauth', { p_brand_id: brandId, p_encryption_key: key });
  if (error) throw new Error(`No se pudo leer la conexión de Mercado Pago: ${error.message}`);
  const fila = (Array.isArray(data) ? data[0] : null) as { access_token: string; refresh_token: string; user_id: string; expires_at: string } | null;
  if (!fila?.access_token) throw new Error('La marca no tiene Mercado Pago conectado.');

  const vence = new Date(fila.expires_at).getTime();
  const vencido = vence <= Date.now();
  if (vence - Date.now() > SIETE_DIAS) return fila.access_token;

  const { data: candado } = await admin.rpc('tomar_candado', { p_clave: `mp_refresh:${brandId}`, p_segundos: 60 });
  if (candado !== true) {
    if (vencido) throw new Error('El token de Mercado Pago venció y se está renovando.');
    return fila.access_token;
  }
  const { clientId, clientSecret } = mpClient();
  if (!clientId || !clientSecret) {
    if (vencido) throw new Error('Falta la app de Mercado Pago de ParyGo para renovar el token.');
    return fila.access_token;
  }
  const r = await refrescarToken({ clientId, clientSecret, refreshToken: fila.refresh_token });
  if (r.ok) {
    // MP rota el refresh token (el viejo ya no sirve): si no se guarda el par
    // nuevo, el próximo refresh daría invalid_grant. Se verifica y reintenta
    // (security review H2).
    for (let intento = 0; intento < 3; intento++) {
      const { data: guardado, error: eG } = await admin.rpc('refresh_brand_mp_oauth', {
        p_brand_id: brandId, p_user_id: fila.user_id, p_access_token: r.tokens.accessToken,
        p_refresh_token: r.tokens.refreshToken, p_expires_at: r.tokens.expiresAt.toISOString(), p_encryption_key: key,
      });
      if (!eG && guardado === true) return r.tokens.accessToken;
      // La marca se desconectó o cambió de cuenta mientras tanto: NO se cobra
      // con el token de la cuenta anterior (Codex P2).
      if (!eG && guardado === false) throw new Error('La conexión de Mercado Pago cambió mientras se renovaba. Intenta de nuevo.');
      await new Promise((ok) => setTimeout(ok, 300 * (intento + 1)));
    }
    // Decisión (Codex lo marcó dos veces): fallar acá no recupera nada —MP ya
    // rotó el refresh— y solo perdería este cobro. Se usa el token nuevo
    // (válido) y queda en la bitácora; si el próximo refresh da invalid_grant,
    // la marca se desconecta con aviso y vuelve a conectar.
    await admin.from('events_log').insert({ brand_id: brandId, type: 'mp_refresh_no_guardado', payload: { cuenta: fila.user_id } });
    return r.tokens.accessToken;
  }
  if (r.error === 'config') {
    await admin.from('events_log').insert({ brand_id: brandId, type: 'mp_refresh_config', payload: { cuenta: fila.user_id } });
  }
  if (r.error === 'revocado') {
    await admin.rpc('clear_brand_mp_oauth', { p_brand_id: brandId });
    await admin.from('events_log').insert({ brand_id: brandId, type: 'mp_refresh_revocado', payload: { cuenta: fila.user_id } });
    throw new Error('La conexión con Mercado Pago fue revocada. La marca tiene que conectarla de nuevo.');
  }
  if (vencido) throw new Error('No se pudo renovar el token de Mercado Pago. Intenta de nuevo en un rato.');
  return fila.access_token;
}
